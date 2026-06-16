import {
  type NormalizedChatRequest,
  type NormalizedChatResponse,
  type NormalizedChunk,
  type ProviderAdapter,
  joinUrl,
  sseLines,
} from "@/lib/adapters/base";
import type { ResolvedProvider } from "@/lib/types";

export function buildUpstreamBody(req: NormalizedChatRequest, stream: boolean) {
  // System defaults: applied only when the client did not send the field.
  // Client extraParams spread afterwards overrides these.
  const out: Record<string, unknown> = {};
  if (req.temperature != null) out.temperature = req.temperature;
  if (req.topP != null && req.topP > 0) out.top_p = req.topP;
  if (req.topK != null) out.top_k = req.topK;
  if (req.reasoningEffort) out.reasoning_effort = req.reasoningEffort;

  // Client params override system defaults.
  Object.assign(out, req.extraParams);

  // Gateway-controlled: always override client and system values.
  out.model = req.realModelId;
  // Use raw client messages when the upstream speaks the same protocol so
  // that tool_calls, tool-result turns, and other fields survive multi-turn.
  out.messages =
    req.rawMessages?.apiMode === "openai" ? req.rawMessages.data : req.messages;
  // max_tokens: client value if provided, otherwise system default.
  out.max_tokens =
    (req.extraParams?.max_tokens as number | undefined) ?? req.maxTokens;
  out.stream = stream;
  // The gateway fully controls stream_options and must NOT forward the
  // client's. Some clients send extra / non-standard stream_options sub-fields
  // which cause certain upstreams to ignore include_usage and omit token
  // counts entirely. We always OVERWRITE (never spread) so the upstream
  // receives exactly { include_usage: true } regardless of the client request.
  if (stream) {
    out.stream_options = { include_usage: true };
  } else {
    // Non-streaming: drop any client stream_options and request usage
    // explicitly. Some providers honour stream_options even for non-streaming;
    // others use a top-level usage include flag — set both for coverage.
    out.stream_options = { include_usage: true };
    out.usage = { include: true };
  }

  return out;
}

function headers(provider: ResolvedProvider): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${provider.apiKey}`,
    ...provider.headers,
  };
}

export class OpenAIAdapter implements ProviderAdapter {
  readonly apiMode = "openai" as const;

  async chat(
    provider: ResolvedProvider,
    req: NormalizedChatRequest,
    signal?: AbortSignal,
  ): Promise<NormalizedChatResponse> {
    const url = joinUrl(provider.baseUrl, "/chat/completions");
    const res = await fetch(url, {
      method: "POST",
      headers: headers(provider),
      body: JSON.stringify(buildUpstreamBody(req, false)),
      signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new UpstreamError(res.status, text);
    }
    const json = (await res.json()) as {
      choices?: {
        message?: { content?: string | null; tool_calls?: unknown };
        finish_reason?: string;
      }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };
    const choice = json.choices?.[0];
    return {
      text: choice?.message?.content ?? "",
      finishReason: choice?.finish_reason ?? null,
      toolCalls: choice?.message?.tool_calls,
      rawMessage: choice?.message,
      usage: {
        inputTokens:
          (json.usage?.prompt_tokens ?? 0) -
          (json.usage?.prompt_tokens_details?.cached_tokens ?? 0),
        cachedReadTokens: json.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        cacheWriteTokens: 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  }

  async *chatStream(
    provider: ResolvedProvider,
    req: NormalizedChatRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<NormalizedChunk> {
    const url = joinUrl(provider.baseUrl, "/chat/completions");
    const res = await fetch(url, {
      method: "POST",
      headers: headers(provider),
      body: JSON.stringify(buildUpstreamBody(req, true)),
      signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new UpstreamError(res.status, text);
    }

    let finalUsage: NormalizedChunk["usage"];
    let finalFinishReason: string | null | undefined;

    for await (const line of sseLines(res.body, signal)) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let evt: {
        choices?: {
          delta?: { content?: string | null; tool_calls?: unknown };
          finish_reason?: string;
        }[];
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          prompt_tokens_details?: { cached_tokens?: number };
        };
      };
      try {
        evt = JSON.parse(payload);
      } catch {
        continue;
      }
      const choice = evt.choices?.[0];
      const rawDelta = choice?.delta;
      const textDelta = rawDelta?.content ?? "";
      const toolCallsDelta = rawDelta?.tool_calls;
      if (choice?.finish_reason) finalFinishReason = choice.finish_reason;
      if (evt.usage) {
        finalUsage = {
          inputTokens:
            (evt.usage.prompt_tokens ?? 0) -
            (evt.usage.prompt_tokens_details?.cached_tokens ?? 0),
          cachedReadTokens: evt.usage.prompt_tokens_details?.cached_tokens ?? 0,
          cacheWriteTokens: 0,
          outputTokens: evt.usage.completion_tokens ?? 0,
        };
      }
      if (textDelta || toolCallsDelta != null || rawDelta != null) {
        yield {
          delta: textDelta,
          rawDelta,
          ...(toolCallsDelta != null ? { toolCallsDelta } : {}),
        };
      }
    }
    yield {
      delta: "",
      finishReason: finalFinishReason ?? "stop",
      // Always yield a concrete usage object. When the upstream omits usage
      // (e.g. provider doesn't support stream_options), finalUsage stays
      // undefined — fall back to zeros so dispatch always sees an object.
      usage: finalUsage ?? {
        inputTokens: 0,
        cachedReadTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
      },
    };
  }
}

export class UpstreamError extends Error {
  constructor(
    public readonly status: number,
    public readonly bodyText: string,
  ) {
    super(`Upstream HTTP ${status}`);
  }
}
