import type { ApiMode, ProviderRow, ResolvedProvider } from "@/lib/types";

/** Build a ResolvedProvider view by parsing headersTemplate JSON.
 *  Uses the endpoint matching `mode` to pick baseUrl and apiKey. */
export function resolveProvider(
  p: ProviderRow,
  mode: ApiMode,
): ResolvedProvider {
  const baseUrl = mode === "openai" ? p.baseUrlOpenai : p.baseUrlAnthropic;
  const apiKey = mode === "openai" ? p.apiKeyOpenai : p.apiKeyAnthropic;
  if (!baseUrl || !apiKey) {
    throw new Error(
      `Provider "${p.id}" does not support ${mode} protocol (missing ${mode === "openai" ? "baseUrlOpenai/apiKeyOpenai" : "baseUrlAnthropic/apiKeyAnthropic"})`,
    );
  }
  let headers: Record<string, string> = {};
  try {
    const parsed = JSON.parse(p.headersTemplate || "{}");
    if (parsed && typeof parsed === "object") {
      headers = Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [
          k,
          String(v),
        ]),
      );
    }
  } catch {
    headers = {};
  }
  return {
    id: p.id,
    name: p.name,
    baseUrl,
    apiKey,
    headers,
  };
}

/** Normalized chat message (OpenAI-shaped, accepted by both adapters). */
export interface NormalizedMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface NormalizedChatRequest {
  messages: NormalizedMessage[];
  stream: boolean;
  // Resolved params (already layered):
  realModelId: string;
  maxTokens: number;
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  reasoningEffort: "low" | "medium" | "high" | null;
  stop?: string[];
  /** Pass-through: OpenAI-style tools array or Anthropic-style tools array. */
  tools?: unknown;
  /** Pass-through: OpenAI tool_choice or Anthropic tool_choice. */
  tool_choice?: unknown;
  /** Any parameters from the client that are forwarded as-is to the upstream
   *  provider. System defaults (temperature, top_p, etc.) are applied first;
   *  these extraParams override them. Gateway fields (model, messages, stream,
   *  max_tokens) are always forced last. */
  extraParams?: Record<string, unknown>;
  /**
   * Original messages from the client in their native protocol format.
   * When the upstream adapter's apiMode matches, these are used as-is so that
   * tool_calls, tool-result turns, and other protocol-specific fields in
   * multi-turn conversations are preserved and not lost by normalization.
   */
  rawMessages?: { data: unknown[]; apiMode: ApiMode };
}

export interface NormalizedUsage {
  inputTokens: number;
  /** Tokens served from prompt cache (OpenAI cached_tokens / Anthropic cache_read). */
  cachedReadTokens: number;
  /** Tokens written to prompt cache (Anthropic cache_creation; 0 for OpenAI). */
  cacheWriteTokens: number;
  outputTokens: number;
}

export interface NormalizedChatResponse {
  text: string;
  finishReason: string | null;
  usage: NormalizedUsage;
  /** Tool calls from the upstream, stored in OpenAI tool_calls array format. */
  toolCalls?: unknown;
  /**
   * Full message object from the upstream response (OpenAI: choices[0].message;
   * Anthropic: full response body). Used for same-protocol passthrough so that
   * provider-specific fields (reasoning_content, thinking blocks, etc.) are not
   * silently dropped.
   */
  rawMessage?: unknown;
}

export interface NormalizedChunk {
  /** Incremental text delta. */
  delta: string;
  /** Optional finish reason on the terminal chunk. */
  finishReason?: string | null;
  /** Optional usage on the terminal chunk. */
  usage?: NormalizedUsage;
  /**
   * Tool call streaming delta in OpenAI tool_calls delta format.
   * Each element may be a full tool call object (first chunk, contains id/name)
   * or a partial update (subsequent chunks, contains only function.arguments).
   */
  toolCallsDelta?: unknown;
  /**
   * Full raw delta object from an OpenAI-compatible upstream. Carries
   * provider-specific fields (reasoning_content, etc.) for same-protocol
   * passthrough.
   */
  rawDelta?: unknown;
  /**
   * Raw Anthropic SSE event for content blocks that don't fit the normalised
   * model (e.g. thinking / signature blocks). The messages route forwards
   * these verbatim.
   */
  rawAnthropicEvent?: { event: string; data: unknown };
}

export interface ProviderAdapter {
  readonly apiMode: ApiMode;
  chat(
    provider: ResolvedProvider,
    req: NormalizedChatRequest,
    signal?: AbortSignal,
  ): Promise<NormalizedChatResponse>;
  chatStream(
    provider: ResolvedProvider,
    req: NormalizedChatRequest,
    signal?: AbortSignal,
  ): AsyncIterable<NormalizedChunk>;
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/** Best-effort SSE line iterator over a fetch Response body. */
export async function* sseLines(
  body: ReadableStream<Uint8Array> | null,
): AsyncGenerator<string> {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      yield line;
    }
  }
  if (buf) yield buf;
}
