import {
  type NormalizedChatRequest,
  type NormalizedChatResponse,
  type NormalizedChunk,
  type ProviderAdapter,
  joinUrl,
  sseLines,
} from "@/lib/adapters/base";
import { UpstreamError } from "@/lib/adapters/openai";
import type { ResolvedProvider } from "@/lib/types";

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

function buildBody(req: NormalizedChatRequest, stream: boolean) {
  const sys = req.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const msgs: AnthropicMessage[] = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

  // System defaults: applied only when the client did not send the field.
  const out: Record<string, unknown> = {};
  if (sys) out.system = sys;
  if (req.temperature != null) out.temperature = req.temperature;
  if (req.topP != null && req.topP > 0) out.top_p = req.topP;
  if (req.topK != null) out.top_k = req.topK;
  if (req.reasoningEffort) {
    const budget =
      req.reasoningEffort === "high"
        ? 4096
        : req.reasoningEffort === "medium"
          ? 2048
          : 1024;
    out.thinking = { type: "enabled", budget_tokens: budget };
  }

  // Client params override system defaults.
  Object.assign(out, req.extraParams);

  // Gateway-controlled: always override client and system values.
  out.model = req.realModelId;
  // System is always derived from normalized messages (it was a top-level field
  // in the original Anthropic request, already extracted during normalization).
  // For user/assistant turns, use raw client messages when the upstream speaks
  // the same protocol so tool_use / tool_result blocks survive multi-turn.
  out.messages =
    req.rawMessages?.apiMode === "anthropic" ? req.rawMessages.data : msgs;
  // max_tokens: client value if provided, otherwise system default.
  out.max_tokens =
    (req.extraParams?.max_tokens as number | undefined) ?? req.maxTokens;
  out.stream = stream;

  return out;
}

function headers(provider: ResolvedProvider): Record<string, string> {
  // Check if the provider's headersTemplate already supplies an Authorization
  // header (e.g. "Authorization: Bearer …"). If so, trust the custom auth and
  // skip both default mechanisms to avoid conflicts.
  const hasCustomAuth = Object.keys(provider.headers).some(
    (k) => k.toLowerCase() === "authorization",
  );
  const base: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  };
  if (!hasCustomAuth) {
    // Send both x-api-key (Anthropic-native) and Authorization (Bearer)
    // so that providers accepting either authentication method will work.
    base["x-api-key"] = provider.apiKey;
    base["Authorization"] = `Bearer ${provider.apiKey}`;
  }
  return { ...base, ...provider.headers };
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly apiMode = "anthropic" as const;

  async chat(
    provider: ResolvedProvider,
    req: NormalizedChatRequest,
  ): Promise<NormalizedChatResponse> {
    const url = joinUrl(provider.baseUrl, "/v1/messages");
    const res = await fetch(url, {
      method: "POST",
      headers: headers(provider),
      body: JSON.stringify(buildBody(req, false)),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new UpstreamError(res.status, text);
    }
    const json = (await res.json()) as {
      content?: {
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: unknown;
      }[];
      stop_reason?: string;
      usage?: {
        input_tokens?: number;
        cache_read_input_tokens?: number;
        output_tokens?: number;
      };
    };
    const text =
      json.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("") ?? "";
    // Convert tool_use blocks to OpenAI tool_calls format.
    const toolUseBlocks =
      json.content?.filter((c) => c.type === "tool_use") ?? [];
    const toolCalls =
      toolUseBlocks.length > 0
        ? toolUseBlocks.map((t, i) => ({
            index: i,
            id: t.id,
            type: "function",
            function: {
              name: t.name,
              arguments: JSON.stringify(t.input ?? {}),
            },
          }))
        : undefined;
    return {
      text,
      finishReason: json.stop_reason ?? null,
      toolCalls,
      rawMessage: json.content,
      usage: {
        inputTokens: json.usage?.input_tokens ?? 0,
        cachedInputTokens: json.usage?.cache_read_input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      },
    };
  }

  async *chatStream(
    provider: ResolvedProvider,
    req: NormalizedChatRequest,
  ): AsyncGenerator<NormalizedChunk> {
    const url = joinUrl(provider.baseUrl, "/v1/messages");
    const res = await fetch(url, {
      method: "POST",
      headers: headers(provider),
      body: JSON.stringify(buildBody(req, true)),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new UpstreamError(res.status, text);
    }

    let inputTokens = 0;
    let cachedInput = 0;
    let outputTokens = 0;
    let finishReason: string | null | undefined;
    // Maps Anthropic content_block index → OpenAI tool_calls index for tool_use blocks.
    const toolBlockToCallIndex = new Map<number, number>();
    let toolCallCounter = 0;

    for await (const line of sseLines(res.body)) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      let evt: {
        type?: string;
        index?: number;
        content_block?: { type?: string; id?: string; name?: string };
        delta?: {
          type?: string;
          text?: string;
          stop_reason?: string;
          partial_json?: string;
        };
        message?: {
          usage?: {
            input_tokens?: number;
            cache_read_input_tokens?: number;
            output_tokens?: number;
          };
        };
        usage?: { output_tokens?: number };
      };
      try {
        evt = JSON.parse(payload);
      } catch {
        continue;
      }
      if (evt.type === "message_start" && evt.message?.usage) {
        inputTokens = evt.message.usage.input_tokens ?? 0;
        cachedInput = evt.message.usage.cache_read_input_tokens ?? 0;
      }
      if (evt.type === "content_block_start") {
        const blockIndex = evt.index ?? 0;
        const block = evt.content_block;
        if (block?.type === "tool_use" && block.id && block.name) {
          const callIndex = toolCallCounter++;
          toolBlockToCallIndex.set(blockIndex, callIndex);
          // Emit the tool call header chunk in OpenAI delta format.
          yield {
            delta: "",
            toolCallsDelta: [
              {
                index: callIndex,
                id: block.id,
                type: "function",
                function: { name: block.name, arguments: "" },
              },
            ],
          };
        } else if (block?.type !== "text") {
          // Forward unknown block types (thinking, signature, etc.) verbatim.
          yield {
            delta: "",
            rawAnthropicEvent: {
              event: "content_block_start",
              data: {
                type: "content_block_start",
                index: blockIndex,
                content_block: block,
              },
            },
          };
        }
      }
      if (evt.type === "content_block_delta") {
        const blockIndex = evt.index ?? 0;
        if (evt.delta?.type === "text_delta") {
          yield { delta: evt.delta.text ?? "" };
        } else if (evt.delta?.type === "input_json_delta") {
          const callIndex = toolBlockToCallIndex.get(blockIndex);
          if (callIndex !== undefined) {
            yield {
              delta: "",
              toolCallsDelta: [
                {
                  index: callIndex,
                  function: { arguments: evt.delta.partial_json ?? "" },
                },
              ],
            };
          }
        } else if (evt.delta?.type != null) {
          // Forward unknown delta types (thinking_delta, etc.) verbatim.
          yield {
            delta: "",
            rawAnthropicEvent: {
              event: "content_block_delta",
              data: {
                type: "content_block_delta",
                index: blockIndex,
                delta: evt.delta,
              },
            },
          };
        }
      }
      if (evt.type === "content_block_stop") {
        const blockIndex = evt.index ?? 0;
        // Forward stop events for non-tool blocks (tool blocks are managed by the route handler).
        if (!toolBlockToCallIndex.has(blockIndex)) {
          yield {
            delta: "",
            rawAnthropicEvent: {
              event: "content_block_stop",
              data: { type: "content_block_stop", index: blockIndex },
            },
          };
        }
      }
      if (evt.type === "message_delta") {
        if (evt.delta?.stop_reason) finishReason = evt.delta.stop_reason;
        if (evt.usage?.output_tokens != null) {
          outputTokens = evt.usage.output_tokens;
        }
      }
    }

    yield {
      delta: "",
      finishReason: finishReason ?? "end_turn",
      usage: { inputTokens, cachedInputTokens: cachedInput, outputTokens },
    };
  }
}
