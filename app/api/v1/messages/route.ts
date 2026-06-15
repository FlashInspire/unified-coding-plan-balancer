/**
 * POST /v1/messages — Anthropic-compatible endpoint.
 */
import { extractApiKey, verifyApiKey } from "@/lib/auth/apiKey";
import {
  anthropicToNormalizedMessages,
  anthropicUserOverrides,
  buildAnthropicNonStreamResponse,
  buildAnthropicStreamStart,
  buildAnthropicTextBlockStart,
  buildAnthropicToolUseBlockStart,
  buildAnthropicStreamDelta,
  buildAnthropicToolUseDelta,
  buildAnthropicStreamEnd,
} from "@/lib/adapters/translate/anthropic";
import {
  dispatchChat,
  dispatchChatStream,
  dispatchDirectChat,
  dispatchDirectChatStream,
  NoCandidateError,
  AllCandidatesFailedError,
  ApiKeyQuotaExceededError,
  type DispatchContext,
} from "@/lib/routing/dispatch";
import { ensureBoot } from "@/lib/boot";

export async function POST(req: Request): Promise<Response> {
  await ensureBoot();
  // Support both `Authorization: Bearer` (OpenAI-style) and
  // `x-api-key` (standard Anthropic client SDK).
  const apiKey = extractApiKey(req);
  if (!apiKey) return jsonErr(401, "Missing Authorization header");
  const key = await verifyApiKey(apiKey);
  if (!key) return jsonErr(401, "Invalid API key");

  // Parse — no strict schema; forward everything as-is
  let rawBody: Record<string, unknown>;
  try {
    const json = await req.json();
    if (!json || typeof json !== "object" || Array.isArray(json))
      throw new Error("body must be an object");
    rawBody = json as Record<string, unknown>;
  } catch (e) {
    return jsonErr(400, e instanceof Error ? e.message : "Invalid JSON body");
  }

  if (typeof rawBody.model !== "string" || !rawBody.model)
    return jsonErr(400, "model is required");
  if (!Array.isArray(rawBody.messages) || rawBody.messages.length === 0)
    return jsonErr(400, "messages must be a non-empty array");

  const ctx: DispatchContext = {
    apiKeyId: key.id,
    apiKeyName: key.name,
    userId: key.ownerId,
    apiModeIn: "anthropic",
    ip:
      req.headers.get("x-forwarded-for") ??
      req.headers.get("x-real-ip") ??
      null,
    userAgent: req.headers.get("user-agent"),
    signal: req.signal,
  };

  // Normalize messages for internal routing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages = anthropicToNormalizedMessages(rawBody as any);

  // Extract user overrides so resolveModelParams can fill in system defaults
  // for any fields the client did NOT send.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overrides = anthropicUserOverrides(rawBody as any);

  // Everything except routing/normalization fields is forwarded as-is.
  const ROUTING_KEYS = new Set(["model", "messages", "stream", "system"]);
  const extraParams: Record<string, unknown> = Object.fromEntries(
    Object.entries(rawBody).filter(([k]) => !ROUTING_KEYS.has(k)),
  );

  // Detect direct provider/model routing (format: "provider-id/model-id")
  const modelStr = rawBody.model as string;
  const slashIdx = modelStr.indexOf("/");
  const directProviderId = slashIdx > 0 ? modelStr.slice(0, slashIdx) : null;
  const directModelId = slashIdx > 0 ? modelStr.slice(slashIdx + 1) : null;

  // Some clients send `stream` as the string "true" rather than a boolean.
  // Treat both as streaming so usage collection takes the streaming path.
  const stream = rawBody.stream === true || rawBody.stream === "true";

  try {
    if (stream) {
      const result =
        directProviderId && directModelId
          ? await dispatchDirectChatStream(
              directProviderId,
              directModelId,
              messages,
              overrides,
              ctx,
              {
                extraParams,
                rawMessages: {
                  data: rawBody.messages as unknown[],
                  apiMode: "anthropic",
                },
              },
            )
          : await dispatchChatStream(rawBody.model, messages, overrides, ctx, {
              extraParams,
              rawMessages: {
                data: rawBody.messages as unknown[],
                apiMode: "anthropic",
              },
            });
      const encoder = new TextEncoder();
      const readableStream = new ReadableStream({
        async start(controller) {
          const abortHandler = () =>
            controller.error(
              new DOMException("The operation was aborted.", "AbortError"),
            );
          req.signal.addEventListener("abort", abortHandler);
          function emit(event: string, data: unknown) {
            controller.enqueue(
              encoder.encode(
                `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
              ),
            );
          }
          try {
            // Emit message_start only (no pre-opened content block).
            for (const e of buildAnthropicStreamStart(
              rawBody.model as string,
            )) {
              emit(e.event, e.data);
            }

            let outputTokens = 0;
            let finishReason = "end_turn";

            // State for lazily opened content blocks.
            let nextBlockIndex = 0;
            let textBlockIndex: number | null = null;
            // Maps OpenAI toolCalls index → Anthropic content block index.
            const toolCallToBlock = new Map<number, number>();
            const openBlockIndices: number[] = [];

            for await (const chunk of result.iterator) {
              // Handle text delta — lazily open a text block on first delta.
              if (chunk.delta) {
                if (textBlockIndex === null) {
                  textBlockIndex = nextBlockIndex++;
                  openBlockIndices.push(textBlockIndex);
                  const e = buildAnthropicTextBlockStart(textBlockIndex);
                  emit(e.event, e.data);
                }
                const e = buildAnthropicStreamDelta(
                  textBlockIndex,
                  chunk.delta,
                );
                emit(e.event, e.data);
              }

              // Handle tool call deltas.
              if (
                chunk.toolCallsDelta != null &&
                Array.isArray(chunk.toolCallsDelta)
              ) {
                for (const tc of chunk.toolCallsDelta as {
                  index: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }[]) {
                  if (!toolCallToBlock.has(tc.index)) {
                    // First chunk for this tool call — open a new content block.
                    const blockIdx = nextBlockIndex++;
                    toolCallToBlock.set(tc.index, blockIdx);
                    openBlockIndices.push(blockIdx);
                    const e = buildAnthropicToolUseBlockStart(
                      blockIdx,
                      tc.id ?? "",
                      tc.function?.name ?? "",
                    );
                    emit(e.event, e.data);
                  }
                  // Emit argument delta if present.
                  const args = tc.function?.arguments;
                  if (args) {
                    const blockIdx = toolCallToBlock.get(tc.index)!;
                    const e = buildAnthropicToolUseDelta(blockIdx, args);
                    emit(e.event, e.data);
                  }
                }
              }

              if (chunk.usage) outputTokens = chunk.usage.outputTokens;
              if (chunk.finishReason) finishReason = chunk.finishReason;

              // Forward raw Anthropic events (thinking blocks, etc.) verbatim.
              if (chunk.rawAnthropicEvent) {
                emit(
                  chunk.rawAnthropicEvent.event,
                  chunk.rawAnthropicEvent.data,
                );
              }
            }

            for (const e of buildAnthropicStreamEnd({
              finishReason,
              outputTokens,
              openBlockIndices,
            })) {
              emit(e.event, e.data);
            }
            controller.close();
          } catch (err) {
            controller.error(err);
          } finally {
            req.signal.removeEventListener("abort", abortHandler);
          }
        },
      });
      return new Response(readableStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } else {
      const result =
        directProviderId && directModelId
          ? await dispatchDirectChat(
              directProviderId,
              directModelId,
              messages,
              overrides,
              ctx,
              {
                extraParams,
                rawMessages: {
                  data: rawBody.messages as unknown[],
                  apiMode: "anthropic",
                },
              },
            )
          : await dispatchChat(rawBody.model, messages, overrides, ctx, {
              extraParams,
              rawMessages: {
                data: rawBody.messages as unknown[],
                apiMode: "anthropic",
              },
            });
      const resp = buildAnthropicNonStreamResponse({
        modelId: rawBody.model as string,
        text: result.response.text,
        finishReason: result.response.finishReason,
        inputTokens: result.response.usage.inputTokens,
        cachedInputTokens: result.response.usage.cachedInputTokens,
        outputTokens: result.response.usage.outputTokens,
        toolCalls: result.response.toolCalls,
        rawContent: result.response.rawMessage,
      });
      return Response.json(resp);
    }
  } catch (err) {
    if (err instanceof ApiKeyQuotaExceededError)
      return jsonErr(429, err.message);
    if (err instanceof NoCandidateError) return jsonErr(404, err.message);
    if (err instanceof AllCandidatesFailedError) {
      // Forward the original upstream error verbatim if available.
      if (err.upstreamStatus && err.upstreamBody) {
        return upstreamErr(err.upstreamStatus, err.upstreamBody);
      }
      return jsonErr(502, err.message);
    }
    return jsonErr(500, "Internal error");
  }
}

function jsonErr(status: number, message: string): Response {
  return Response.json({ error: { message, type: "error" } }, { status });
}

/** Forward an upstream error body verbatim to the client. */
function upstreamErr(status: number, body: string): Response {
  // Try to detect JSON upstream errors and forward as-is.
  try {
    const json = JSON.parse(body);
    return Response.json(json, { status });
  } catch {
    // Not JSON — wrap in Anthropic-style error envelope.
    return Response.json(
      { type: "error", error: { type: "upstream_error", message: body } },
      { status },
    );
  }
}
