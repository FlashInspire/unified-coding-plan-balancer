/**
 * Cross-protocol translation helpers.
 *
 * When a client speaks one protocol (e.g. OpenAI) but the upstream provider
 * only supports another (e.g. Anthropic), we translate the NormalizedChatRequest
 * before sending it to the adapter, and translate the NormalizedChatResponse /
 * NormalizedChunk stream back to the client's protocol afterward.
 *
 * The NormalizedChatRequest/Response/Chunk types are already semi-agnostic
 * (role/content messages, usage fields). The main translation work is:
 * - Request: converting extraParams between protocol conventions
 * - Response: converting rawMessage to the client's protocol format
 * - Stream: converting rawDelta / rawAnthropicEvent to the client's format
 */

import type {
  NormalizedChatRequest,
  NormalizedChatResponse,
  NormalizedChunk,
} from "@/lib/adapters/base";
import {
  buildOpenAINonStreamResponse,
  buildOpenAIStreamChunk,
} from "@/lib/adapters/translate/openai";
import {
  buildAnthropicNonStreamResponse,
  buildAnthropicStreamStart,
  buildAnthropicTextBlockStart,
  buildAnthropicStreamDelta,
  buildAnthropicStreamEnd,
  buildAnthropicToolUseBlockStart,
  buildAnthropicToolUseDelta,
  buildAnthropicBlockStop,
} from "@/lib/adapters/translate/anthropic";
import type { ApiMode } from "@/lib/types";

// ---------------------------------------------------------------------------
// Request translation
// ---------------------------------------------------------------------------

/**
 * Translate a NormalizedChatRequest's extraParams from the client's protocol
 * to the upstream adapter's protocol. The NormalizedChatRequest itself is
 * protocol-agnostic; only extraParams (which are forwarded as-is to upstream)
 * need conversion.
 */
export function translateRequestExtraParams(
  req: NormalizedChatRequest,
  from: ApiMode,
  to: ApiMode,
): NormalizedChatRequest {
  if (from === to) return req;
  if (!req.extraParams) return req;

  const translated = { ...req.extraParams };

  if (from === "openai" && to === "anthropic") {
    // OpenAI → Anthropic: translate stop → stop_sequences
    if (translated.stop != null && translated.stop_sequences == null) {
      translated.stop_sequences = translated.stop;
      delete translated.stop;
    }
    // OpenAI tools [{type:"function",function:{name,description,parameters}}]
    // → Anthropic tools [{name,description,input_schema}]
    if (Array.isArray(translated.tools)) {
      translated.tools = (translated.tools as unknown[]).map((t) =>
        translateToolToAnthropic(t as Record<string, unknown>),
      );
    }
    // OpenAI tool_choice → Anthropic tool_choice
    if (translated.tool_choice != null) {
      translated.tool_choice = translateToolChoiceToAnthropic(
        translated.tool_choice as unknown,
      );
    }
    // Remove OpenAI-specific fields that Anthropic doesn't understand
    delete translated.frequency_penalty;
    delete translated.presence_penalty;
    delete translated.logit_bias;
    delete translated.n;
    delete translated.response_format;
    delete translated.seed;
    delete translated.user;
    delete translated.parallel_tool_calls;
    // reasoning_effort → thinking budget is handled by the Anthropic adapter
    // already when it sees reasoningEffort on the NormalizedChatRequest.
  } else if (from === "anthropic" && to === "openai") {
    // Anthropic → OpenAI: translate stop_sequences → stop
    if (translated.stop_sequences != null && translated.stop == null) {
      translated.stop = translated.stop_sequences;
      delete translated.stop_sequences;
    }
    // Anthropic tools [{name,description,input_schema}]
    // → OpenAI tools [{type:"function",function:{name,description,parameters}}]
    if (Array.isArray(translated.tools)) {
      translated.tools = (translated.tools as unknown[]).map((t) =>
        translateToolToOpenAI(t as Record<string, unknown>),
      );
    }
    // Anthropic tool_choice → OpenAI tool_choice
    if (translated.tool_choice != null) {
      translated.tool_choice = translateToolChoiceToOpenAI(
        translated.tool_choice as unknown,
      );
    }
    // Remove Anthropic-specific fields
    delete translated.thinking;
    delete translated.metadata;
  }

  return { ...req, extraParams: translated };
}

// ---------------------------------------------------------------------------
// Non-streaming response translation
// ---------------------------------------------------------------------------

/**
 * Translate a NormalizedChatResponse (produced by the upstream adapter) back
 * to the client's protocol format.
 */
export function translateResponse(
  resp: NormalizedChatResponse,
  modelId: string,
  upstreamMode: ApiMode,
  clientMode: ApiMode,
): unknown {
  if (upstreamMode === clientMode) {
    // Same protocol — return rawMessage as-is (passthrough).
    return resp.rawMessage;
  }

  if (clientMode === "openai") {
    // Upstream was Anthropic, client wants OpenAI format.
    return buildOpenAINonStreamResponse({
      modelId,
      text: resp.text,
      finishReason: mapFinishReason(resp.finishReason, "anthropic", "openai"),
      inputTokens: resp.usage.inputTokens,
      cachedReadTokens: resp.usage.cachedReadTokens,
      outputTokens: resp.usage.outputTokens,
      toolCalls: resp.toolCalls,
    });
  } else {
    // Upstream was OpenAI, client wants Anthropic format.
    return buildAnthropicNonStreamResponse({
      modelId,
      text: resp.text,
      finishReason: mapFinishReason(resp.finishReason, "openai", "anthropic"),
      inputTokens: resp.usage.inputTokens,
      cachedReadTokens: resp.usage.cachedReadTokens,
      outputTokens: resp.usage.outputTokens,
      toolCalls: resp.toolCalls,
    });
  }
}

// ---------------------------------------------------------------------------
// Streaming response translation
// ---------------------------------------------------------------------------

/**
 * Wrap an upstream stream (producing NormalizedChunks in the upstream's
 * protocol) into chunks formatted for the client's protocol.
 */
export async function* translateStream(
  chunks: AsyncIterable<NormalizedChunk>,
  modelId: string,
  upstreamMode: ApiMode,
  clientMode: ApiMode,
): AsyncGenerator<{ event?: string; data?: unknown; sse?: string }> {
  if (upstreamMode === clientMode) {
    // Same protocol — yield raw chunks for passthrough.
    for await (const chunk of chunks) {
      yield { sse: JSON.stringify(chunk) };
    }
    return;
  }

  if (clientMode === "openai") {
    // Upstream was Anthropic → client wants OpenAI SSE.
    // The upstream NormalizedChunks already have delta/finishReason/usage
    // in normalized form. We just need to wrap them in OpenAI chunk format.
    for await (const chunk of chunks) {
      const sse = buildOpenAIStreamChunk({
        modelId,
        delta: chunk.delta,
        finishReason: mapFinishReason(
          chunk.finishReason,
          "anthropic",
          "openai",
        ),
        toolCallsDelta: chunk.toolCallsDelta,
      });
      yield { sse: JSON.stringify(sse) };
    }
  } else {
    // Upstream was OpenAI → client wants Anthropic SSE.
    // message_start is emitted eagerly with zero usage; OpenAI upstreams
    // typically report usage only on the terminal chunk, so real input
    // tokens are surfaced in message_delta below as a safety net.
    yield {
      event: "message_start",
      data: buildAnthropicStreamStart(modelId)[0].data,
    };

    let blockIndex = 0;
    let textBlockOpened = false;
    const toolCallToBlock = new Map<number, number>();
    const openBlockIndices: number[] = [];
    let inputTokens = 0;
    let cachedReadTokens = 0;
    let cacheWriteTokens = 0;
    let outputTokens = 0;
    let finishReason = "end_turn";

    for await (const chunk of chunks) {
      // Text delta
      if (chunk.delta) {
        if (!textBlockOpened) {
          textBlockOpened = true;
          openBlockIndices.push(blockIndex);
          yield {
            event: "content_block_start",
            data: buildAnthropicTextBlockStart(blockIndex).data,
          };
          blockIndex++;
        }
        yield {
          event: "content_block_delta",
          data: buildAnthropicStreamDelta(0, chunk.delta).data,
        };
      }

      // Tool calls
      if (chunk.toolCallsDelta != null && Array.isArray(chunk.toolCallsDelta)) {
        for (const tc of chunk.toolCallsDelta as {
          index: number;
          id?: string;
          function?: { name?: string; arguments?: string };
        }[]) {
          if (!toolCallToBlock.has(tc.index)) {
            const blockIdx = blockIndex++;
            toolCallToBlock.set(tc.index, blockIdx);
            openBlockIndices.push(blockIdx);
            yield {
              event: "content_block_start",
              data: buildAnthropicToolUseBlockStart(
                blockIdx,
                tc.id ?? "",
                tc.function?.name ?? "",
              ).data,
            };
          }
          const args = tc.function?.arguments;
          if (args) {
            const blockIdx = toolCallToBlock.get(tc.index)!;
            yield {
              event: "content_block_delta",
              data: buildAnthropicToolUseDelta(blockIdx, args).data,
            };
          }
        }
      }

      if (chunk.usage) {
        inputTokens = chunk.usage.inputTokens ?? inputTokens;
        cachedReadTokens = chunk.usage.cachedReadTokens ?? cachedReadTokens;
        cacheWriteTokens = chunk.usage.cacheWriteTokens ?? cacheWriteTokens;
        outputTokens = chunk.usage.outputTokens ?? outputTokens;
      }
      if (chunk.finishReason) {
        finishReason =
          mapFinishReason(chunk.finishReason, "openai", "anthropic") ??
          "end_turn";
      }
    }

    // Close all open blocks
    for (const idx of openBlockIndices) {
      yield {
        event: "content_block_stop",
        data: buildAnthropicBlockStop(idx).data,
      };
    }

    // message_delta + message_stop. Full usage is emitted here as a safety net
    // since OpenAI upstreams only report usage on the terminal chunk (so we
    // couldn't populate message_start with real input_tokens).
    const endEvents = buildAnthropicStreamEnd({
      finishReason,
      outputTokens,
      openBlockIndices: [], // already closed above
      inputTokens,
      cachedReadTokens,
      cacheWriteTokens,
    });
    for (const e of endEvents) {
      yield { event: e.event, data: e.data };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map finish reasons between protocols. */
function mapFinishReason(
  reason: string | null | undefined,
  from: ApiMode,
  _to: ApiMode,
): string | null {
  if (!reason) return null;
  if (from === "anthropic") {
    // Anthropic → OpenAI
    if (reason === "end_turn" || reason === "stop_sequence") return "stop";
    if (reason === "max_tokens") return "length";
    return reason;
  }
  // OpenAI → Anthropic
  if (reason === "stop") return "end_turn";
  if (reason === "length") return "max_tokens";
  if (reason === "tool_calls") return "tool_use";
  return reason;
}

// ---------------------------------------------------------------------------
// Tool translation helpers
// ---------------------------------------------------------------------------

/**
 * OpenAI tool: { type:"function", function:{ name, description, parameters } }
 * Anthropic tool: { name, description, input_schema }
 */
function translateToolToAnthropic(
  tool: Record<string, unknown>,
): Record<string, unknown> {
  // Already Anthropic-shaped (idempotent guard).
  if (typeof tool.name === "string" && tool.input_schema != null) {
    return tool;
  }
  const fn = (tool.function as Record<string, unknown> | undefined) ?? {};
  const out: Record<string, unknown> = {
    name: fn.name ?? tool.name,
  };
  if (fn.description != null) out.description = fn.description;
  else if (tool.description != null) out.description = tool.description;
  // OpenAI stores JSON schema in `parameters`; Anthropic uses `input_schema`.
  const schema =
    (fn.parameters as Record<string, unknown> | undefined) ??
    (tool.input_schema as Record<string, unknown> | undefined);
  out.input_schema = schema ?? { type: "object", properties: {} };
  return out;
}

function translateToolToOpenAI(
  tool: Record<string, unknown>,
): Record<string, unknown> {
  // Already OpenAI-shaped (idempotent guard).
  if (tool.type === "function" && tool.function != null) {
    return tool;
  }
  const fn: Record<string, unknown> = {
    name: tool.name,
  };
  if (tool.description != null) fn.description = tool.description;
  // Anthropic stores JSON schema in `input_schema`; OpenAI uses `parameters`.
  fn.parameters = (tool.input_schema as Record<string, unknown> | undefined) ??
    (tool.parameters as Record<string, unknown> | undefined) ?? {
      type: "object",
      properties: {},
    };
  return { type: "function", function: fn };
}

/**
 * OpenAI tool_choice:
 *   "auto" | "none" | "required" | "tool" | { type:"function", function:{ name } }
 * Anthropic tool_choice:
 *   { type:"auto"|"any"|"tool", name? }
 */
function translateToolChoiceToAnthropic(
  choice: unknown,
): Record<string, unknown> {
  if (typeof choice === "string") {
    if (choice === "auto") return { type: "auto" };
    if (choice === "none") return { type: "auto" }; // Anthropic has no "none"
    if (choice === "required") return { type: "any" };
    if (choice === "tool") return { type: "any" };
    return { type: "auto" };
  }
  if (choice && typeof choice === "object") {
    const c = choice as Record<string, unknown>;
    // Already Anthropic-shaped.
    if (typeof c.type === "string" && c.type !== "function") return c;
    // OpenAI object: { type:"function", function:{ name } }
    if (c.type === "function") {
      const fn = (c.function as Record<string, unknown> | undefined) ?? {};
      return { type: "tool", name: fn.name };
    }
    // Fallback: object without type — treat as auto.
  }
  return { type: "auto" };
}

function translateToolChoiceToOpenAI(choice: unknown): unknown {
  if (typeof choice === "string") {
    // Anthropic clients rarely send a bare string, but pass through the
    // shared values ("auto"/"none"). "any"/"tool" map to "required".
    if (choice === "auto" || choice === "none") return choice;
    return "required";
  }
  if (choice && typeof choice === "object") {
    const c = choice as Record<string, unknown>;
    // Already OpenAI-shaped.
    if (c.type === "function" && c.function != null) return c;
    const type = c.type as string | undefined;
    if (type === "auto") return "auto";
    if (type === "any") return "required";
    if (type === "tool" && typeof c.name === "string") {
      return { type: "function", function: { name: c.name } };
    }
  }
  return "auto";
}
