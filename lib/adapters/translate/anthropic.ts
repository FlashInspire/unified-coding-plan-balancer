/**
 * Public-facing Anthropic Messages API translation helpers.
 */
import type { NormalizedMessage } from "@/lib/adapters/base";
import { flattenContent } from "@/lib/adapters/translate/openai";
import type { UserOverrides } from "@/lib/types";

export interface AnthropicMessageBlock {
  role: "user" | "assistant";
  content: string | unknown;
}

export interface AnthropicRequest {
  model: string;
  messages: AnthropicMessageBlock[];
  system?: string | unknown;
  max_tokens: number;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  thinking?: { type?: string; budget_tokens?: number };
}

export function anthropicToNormalizedMessages(
  req: AnthropicRequest,
): NormalizedMessage[] {
  const out: NormalizedMessage[] = [];
  const sys = flattenContent(req.system);
  if (sys) out.push({ role: "system", content: sys });
  for (const m of req.messages) {
    out.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content: flattenContent(m.content),
    });
  }
  return out;
}

export function anthropicUserOverrides(req: AnthropicRequest): UserOverrides {
  let reasoning: UserOverrides["reasoningEffort"] = null;
  if (req.thinking?.budget_tokens) {
    const b = req.thinking.budget_tokens;
    reasoning = b >= 3072 ? "high" : b >= 1536 ? "medium" : "low";
  }
  return {
    temperature: req.temperature ?? null,
    topP: req.top_p ?? null,
    topK: req.top_k ?? null,
    maxTokens: req.max_tokens ?? null,
    reasoningEffort: reasoning,
  };
}

export function buildAnthropicNonStreamResponse(args: {
  modelId: string;
  text: string;
  finishReason: string | null;
  inputTokens: number;
  cachedReadTokens: number;
  outputTokens: number;
  toolCalls?: unknown;
  /** Raw content array from upstream; used as-is to preserve all block types (thinking, etc.). */
  rawContent?: unknown;
}) {
  // Use the raw upstream content array when available to preserve all block
  // types (thinking, signature, redacted_thinking, etc.).
  let content: unknown[];
  if (Array.isArray(args.rawContent)) {
    content = args.rawContent as unknown[];
  } else {
    content = [];
    if (args.text) content.push({ type: "text", text: args.text });
    if (Array.isArray(args.toolCalls)) {
      for (const tc of args.toolCalls as {
        id?: string;
        function?: { name?: string; arguments?: string };
      }[]) {
        let input: unknown = {};
        try {
          input = JSON.parse(tc.function?.arguments ?? "{}");
        } catch {
          /* keep empty object */
        }
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function?.name,
          input,
        });
      }
    }
    // Ensure at least an empty text block when there is nothing else.
    if (content.length === 0) content.push({ type: "text", text: "" });
  }
  return {
    id: `msg_${rand()}`,
    type: "message",
    role: "assistant",
    model: args.modelId,
    content,
    stop_reason: args.finishReason ?? "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: args.inputTokens,
      cache_read_input_tokens: args.cachedReadTokens,
      output_tokens: args.outputTokens,
    },
  };
}

/** Sequence of SSE events for streaming Anthropic. */
export function buildAnthropicStreamStart(
  modelId: string,
  usage?: {
    inputTokens?: number;
    cachedReadTokens?: number;
    cacheWriteTokens?: number;
    outputTokens?: number;
  },
) {
  const inputTokens = usage?.inputTokens ?? 0;
  const cachedRead = usage?.cachedReadTokens ?? 0;
  const cacheWrite = usage?.cacheWriteTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  return [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: `msg_${rand()}`,
          type: "message",
          role: "assistant",
          model: modelId,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: inputTokens,
            cache_read_input_tokens: cachedRead,
            cache_creation_input_tokens: cacheWrite,
            output_tokens: outputTokens,
          },
        },
      },
    },
  ];
}

/** Open a text content block at the given index. */
export function buildAnthropicTextBlockStart(index: number) {
  return {
    event: "content_block_start",
    data: {
      type: "content_block_start",
      index,
      content_block: { type: "text", text: "" },
    },
  };
}

/** Open a tool_use content block at the given index. */
export function buildAnthropicToolUseBlockStart(
  index: number,
  id: string,
  name: string,
) {
  return {
    event: "content_block_start",
    data: {
      type: "content_block_start",
      index,
      content_block: { type: "tool_use", id, name, input: {} },
    },
  };
}

/** Close a content block at the given index. */
export function buildAnthropicBlockStop(index: number) {
  return {
    event: "content_block_stop",
    data: { type: "content_block_stop", index },
  };
}

export function buildAnthropicStreamDelta(index: number, delta: string) {
  return {
    event: "content_block_delta",
    data: {
      type: "content_block_delta",
      index,
      delta: { type: "text_delta", text: delta },
    },
  };
}

/** Emit partial tool input JSON for a tool_use content block. */
export function buildAnthropicToolUseDelta(index: number, partialJson: string) {
  return {
    event: "content_block_delta",
    data: {
      type: "content_block_delta",
      index,
      delta: { type: "input_json_delta", partial_json: partialJson },
    },
  };
}

export function buildAnthropicStreamEnd(args: {
  finishReason: string;
  outputTokens: number;
  openBlockIndices: number[];
  /**
   * Optional full token counts emitted in the `message_delta` usage block as a
   * safety net for clients that only read final usage from `message_delta`.
   * Anthropic's native API puts only `output_tokens` here, but extra fields
   * don't break clients and ensure totals are available even when the route
   * handler couldn't populate `message_start` with real input counts.
   */
  inputTokens?: number;
  cachedReadTokens?: number;
  cacheWriteTokens?: number;
}) {
  return [
    ...args.openBlockIndices.map((i) => ({
      event: "content_block_stop",
      data: { type: "content_block_stop", index: i },
    })),
    {
      event: "message_delta",
      data: {
        type: "message_delta",
        delta: { stop_reason: args.finishReason, stop_sequence: null },
        usage: {
          input_tokens: args.inputTokens ?? 0,
          cache_read_input_tokens: args.cachedReadTokens ?? 0,
          cache_creation_input_tokens: args.cacheWriteTokens ?? 0,
          output_tokens: args.outputTokens,
        },
      },
    },
    { event: "message_stop", data: { type: "message_stop" } },
  ];
}

function rand(): string {
  return Math.random().toString(36).slice(2, 14);
}
