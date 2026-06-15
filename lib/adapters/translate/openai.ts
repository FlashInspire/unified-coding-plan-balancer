/**
 * Public-facing OpenAI Chat Completions request/response shapes.
 * Only the fields we actually consume / emit are typed.
 */

import type { NormalizedMessage } from "@/lib/adapters/base";
import type { UserOverrides } from "@/lib/types";

export interface OpenAIChatMessage {
  role: "system" | "user" | "assistant";
  content: string | unknown;
}

export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIChatMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  reasoning_effort?: "low" | "medium" | "high";
  include_reasoning?: boolean;
  stop?: string | string[];
  // Pass-through fields are intentionally ignored to enforce param resolution.
}

/** Best-effort flatten of `content` (which can be string or array of parts). */
export function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === "string") return p;
        if (p && typeof p === "object" && "text" in p) {
          const t = (p as { text?: unknown }).text;
          return typeof t === "string" ? t : "";
        }
        return "";
      })
      .join("");
  }
  return "";
}

export function openaiToNormalizedMessages(
  msgs: OpenAIChatMessage[],
): NormalizedMessage[] {
  return msgs.map((m) => ({
    role:
      m.role === "assistant"
        ? "assistant"
        : m.role === "system"
          ? "system"
          : "user",
    content: flattenContent(m.content),
  }));
}

export function openaiUserOverrides(req: OpenAIChatRequest): UserOverrides {
  return {
    temperature: req.temperature ?? null,
    topP: req.top_p ?? null,
    topK: req.top_k ?? null,
    maxTokens: req.max_completion_tokens ?? req.max_tokens ?? null,
    reasoningEffort: req.reasoning_effort ?? null,
    includeReasoning: req.include_reasoning ?? null,
  };
}

export function normalizeStop(
  v: string | string[] | undefined,
): string[] | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v : [v];
}

/** Build a single non-streaming OpenAI-style response object. */
export function buildOpenAINonStreamResponse(args: {
  modelId: string;
  text: string;
  finishReason: string | null;
  inputTokens: number;
  cachedReadTokens: number;
  outputTokens: number;
  toolCalls?: unknown;
  /** Full raw message from the upstream; used as-is to preserve provider-specific fields. */
  rawMessage?: unknown;
}) {
  // Use the raw upstream message when available so provider-specific fields
  // (reasoning_content, etc.) are preserved and can be sent back in multi-turn.
  const message: unknown =
    args.rawMessage ??
    (() => {
      const m: Record<string, unknown> = { role: "assistant" };
      if (args.toolCalls != null) {
        m.content = null;
        m.tool_calls = args.toolCalls;
      } else {
        m.content = args.text;
      }
      return m;
    })();
  return {
    id: `chatcmpl-${cryptoRandom()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: args.modelId,
    choices: [
      {
        index: 0,
        message,
        finish_reason: args.finishReason ?? "stop",
      },
    ],
    usage: {
      prompt_tokens: args.inputTokens,
      completion_tokens: args.outputTokens,
      total_tokens: args.inputTokens + args.outputTokens,
      prompt_tokens_details: { cached_tokens: args.cachedReadTokens },
    },
  };
}

/** SSE chunk JSON shape for OpenAI streaming. */
export function buildOpenAIStreamChunk(args: {
  modelId: string;
  delta: string;
  finishReason?: string | null;
  toolCallsDelta?: unknown;
  /** Full raw delta from the upstream; used as-is to preserve provider-specific fields. */
  rawDelta?: unknown;
}) {
  // Use the raw upstream delta when available to preserve provider-specific
  // fields (reasoning_content, etc.).
  const delta: unknown =
    args.rawDelta ??
    (() => {
      const d: Record<string, unknown> = {};
      if (args.delta) d.content = args.delta;
      if (args.toolCallsDelta != null) d.tool_calls = args.toolCallsDelta;
      return d;
    })();
  return {
    id: `chatcmpl-${cryptoRandom()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: args.modelId,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: args.finishReason ?? null,
      },
    ],
  };
}

function cryptoRandom(): string {
  return Math.random().toString(36).slice(2, 12);
}
