/**
 * POST /v1/chat/completions — OpenAI-compatible chat endpoint.
 */
import { extractBearer, verifyApiKey } from "@/lib/auth/apiKey";
import {
  openaiToNormalizedMessages,
  openaiUserOverrides,
  buildOpenAINonStreamResponse,
  buildOpenAIStreamChunk,
} from "@/lib/adapters/translate/openai";
import {
  dispatchChat,
  dispatchChatStream,
  dispatchDirectChat,
  dispatchDirectChatStream,
  NoCandidateError,
  AllCandidatesFailedError,
  type DispatchContext,
} from "@/lib/routing/dispatch";
import { ensureBoot } from "@/lib/boot";

export async function POST(req: Request): Promise<Response> {
  await ensureBoot();

  // Auth
  const bearer = extractBearer(req);
  if (!bearer) return jsonErr(401, "Missing Authorization header");
  const key = await verifyApiKey(bearer);
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
    apiModeIn: "openai",
    ip:
      req.headers.get("x-forwarded-for") ??
      req.headers.get("x-real-ip") ??
      null,
    userAgent: req.headers.get("user-agent"),
    signal: req.signal,
  };

  // Normalize messages for internal routing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages = openaiToNormalizedMessages(rawBody.messages as any[]);

  // Extract user overrides so resolveModelParams can fill in system defaults
  // for any fields the client did NOT send.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overrides = openaiUserOverrides(rawBody as any);

  // Everything except the three routing/normalization fields is forwarded as-is.
  // max_completion_tokens is normalized to max_tokens for upstream compatibility.
  const ROUTING_KEYS = new Set(["model", "messages", "stream"]);
  const extraParams: Record<string, unknown> = Object.fromEntries(
    Object.entries(rawBody).filter(([k]) => !ROUTING_KEYS.has(k)),
  );
  if (
    extraParams.max_completion_tokens != null &&
    extraParams.max_tokens == null
  ) {
    extraParams.max_tokens = extraParams.max_completion_tokens;
  }
  delete extraParams.max_completion_tokens;

  // Detect direct provider/model routing (format: "provider-id/model-id")
  const modelStr = rawBody.model as string;
  const slashIdx = modelStr.indexOf("/");
  const directProviderId = slashIdx > 0 ? modelStr.slice(0, slashIdx) : null;
  const directModelId = slashIdx > 0 ? modelStr.slice(slashIdx + 1) : null;

  const stream = rawBody.stream === true;

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
                  apiMode: "openai",
                },
              },
            )
          : await dispatchChatStream(rawBody.model, messages, overrides, ctx, {
              extraParams,
              rawMessages: {
                data: rawBody.messages as unknown[],
                apiMode: "openai",
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
          try {
            for await (const chunk of result.iterator) {
              const sse = buildOpenAIStreamChunk({
                modelId: rawBody.model as string,
                delta: chunk.delta,
                finishReason: chunk.finishReason,
                toolCallsDelta: chunk.toolCallsDelta,
                rawDelta: chunk.rawDelta,
              });
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(sse)}\n\n`),
              );
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
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
                  apiMode: "openai",
                },
              },
            )
          : await dispatchChat(rawBody.model, messages, overrides, ctx, {
              extraParams,
              rawMessages: {
                data: rawBody.messages as unknown[],
                apiMode: "openai",
              },
            });
      const resp = buildOpenAINonStreamResponse({
        modelId: rawBody.model as string,
        text: result.response.text,
        finishReason: result.response.finishReason,
        inputTokens: result.response.usage.inputTokens,
        cachedInputTokens: result.response.usage.cachedInputTokens,
        outputTokens: result.response.usage.outputTokens,
        toolCalls: result.response.toolCalls,
        rawMessage: result.response.rawMessage,
      });
      return Response.json(resp);
    }
  } catch (err) {
    if (err instanceof NoCandidateError) return jsonErr(404, err.message);
    if (err instanceof AllCandidatesFailedError)
      return jsonErr(502, err.message);
    return jsonErr(500, "Internal error");
  }
}

function jsonErr(status: number, message: string): Response {
  return Response.json({ error: { message, type: "error" } }, { status });
}
