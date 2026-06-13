/**
 * The router entry point: select a candidate, dispatch the call, collect
 * metrics, and fall back on retryable errors.
 *
 * Both non-streaming and streaming paths share the same selection / fallback
 * logic. Streaming wraps the adapter's AsyncIterable so we can record TTFT
 * once the first chunk arrives.
 */
import {
  type NormalizedChatRequest,
  type NormalizedChatResponse,
  type NormalizedChunk,
  resolveProvider,
} from "@/lib/adapters/base";
import { getAdapter } from "@/lib/adapters";
import { UpstreamError } from "@/lib/adapters/openai";
import {
  translateRequestExtraParams,
  translateResponse,
  translateStream,
} from "@/lib/adapters/translate/cross-protocol";
import { metricsBuffer, type RequestLogRecord } from "@/lib/metrics/buffer";
import { logRequestStart, logRequestUpdate } from "@/lib/metrics/flusher";
import { modelRepo } from "@/lib/repositories/modelRepo";
import { providerModelRepo } from "@/lib/repositories/providerModelRepo";
import type { RoutingCandidate } from "@/lib/repositories/providerModelRepo";
import { providerRepo } from "@/lib/repositories/providerRepo";
import {
  incrementQuotaExhaustedRetry,
  markQuotaRunningOut,
  markTransientFailure,
  selectCandidates,
} from "@/lib/routing/selectCandidate";
import { getStickyProvider, setStickyProvider } from "@/lib/routing/sticky";
import { resolveModelParams } from "@/lib/routing/resolveParams";
import { activeRequests } from "@/lib/routing/activeRequests";
import { env } from "@/lib/env";
import { keyTokenBuffer } from "@/lib/quota/keyTokenBuffer";
import type {
  ApiMode,
  ModelRow,
  ProviderModelRow,
  ProviderRow,
  ResolvedParams,
  UserOverrides,
} from "@/lib/types";

export class NoCandidateError extends Error {
  readonly status = 404;
  constructor(modelId: string, reason?: string) {
    super(
      `No available provider for model "${modelId}"` +
        (reason ? ` (${reason})` : ""),
    );
  }
}

export class AllCandidatesFailedError extends Error {
  readonly status = 502;
  constructor(
    modelId: string,
    public readonly attempts: {
      providerId: string;
      status: number;
      message: string;
    }[],
    /**
     * When the last candidate failed with a non-retryable upstream error
     * (e.g. 400, 401, 403, 422), these fields carry the original error
     * so the route handler can forward it verbatim to the client.
     */
    public readonly upstreamStatus?: number,
    public readonly upstreamBody?: string,
  ) {
    super(`All ${attempts.length} candidates for "${modelId}" failed`);
  }
}

export class ApiKeyQuotaExceededError extends Error {
  readonly status = 429;
  constructor(keyName: string) {
    super(`API key "${keyName}" token quota exceeded`);
  }
}

export interface DispatchContext {
  apiKeyId: string;
  apiKeyName: string;
  apiModeIn: ApiMode;
  ip: string | null;
  userAgent: string | null;
  /** AbortSignal from the incoming client request. When triggered, the
   *  upstream fetch is aborted and the stream iterator exits early. */
  signal?: AbortSignal;
}

export interface DispatchSuccess {
  response: NormalizedChatResponse;
  provider: ProviderRow;
  pm: ProviderModelRow;
  params: ResolvedParams;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof UpstreamError) {
    return err.status === 429 || err.status >= 500;
  }
  if (
    err instanceof Error &&
    /fetch failed|network|timeout|ECONN/i.test(err.message)
  ) {
    return true;
  }
  return false;
}

function emitMetrics(record: RequestLogRecord): void {
  try {
    metricsBuffer.push(record);
  } catch {
    /* never block on metrics */
  }
}

/** Immediately write a partial update to an in-flight log row. */
function emitMetricsUpdate(
  requestId: number,
  ts: number,
  fields: Parameters<typeof logRequestUpdate>[2],
): void {
  try {
    logRequestUpdate(requestId, ts, fields);
  } catch {
    /* never block on metrics */
  }
}

/** Insert an in-flight log row and return the row ID. Best-effort. */
function emitMetricsStart(record: RequestLogRecord): number | null {
  try {
    return logRequestStart(record);
  } catch {
    return null;
  }
}

async function loadModel(modelId: string): Promise<ModelRow> {
  const m = await modelRepo.findById(modelId);
  if (!m || !m.enabled) throw new NoCandidateError(modelId);
  return m;
}

/**
 * Track quota-exhausted retry for a candidate. If the provider's usagePercent
 * is at or above the exhaust threshold, increment the retry counter. If the
 * counter reaches MAX_QUOTA_RETRIES, mark the provider as "Running out" in
 * both in-memory state and the DB (best-effort).
 */
function trackQuotaExhaustedRetry(c: RoutingCandidate): void {
  if ((c.usagePercent ?? 0) < env.QUOTA_EXHAUST_THRESHOLD) return;
  const retries = incrementQuotaExhaustedRetry(c.provider.id);
  if (retries >= env.MAX_QUOTA_RETRIES) {
    markQuotaRunningOut(c.provider.id);
    // Best-effort DB update — never block on this
    providerRepo
      .update(c.provider.id, { quotaRunningOut: true })
      .catch(() => {});
  }
}

/**
 * Determine which API mode a candidate provider supports for the given
 * client protocol, respecting the ProviderModel's apiStyle override.
 *
 * Priority:
 * 1. If apiStyle is "openai" or "anthropic", force that protocol (if available).
 * 2. If apiStyle is "auto", prefer same-protocol, then fallback to the other.
 * Returns null if the provider has no usable endpoint at all.
 */
function candidateApiMode(
  c: RoutingCandidate,
  preferred: ApiMode,
): ApiMode | null {
  const p = c.provider;
  const pmStyle = c.pm.apiStyle;

  // Forced apiStyle: always use the specified protocol.
  if (pmStyle === "openai") {
    return p.baseUrlOpenai ? "openai" : null;
  }
  if (pmStyle === "anthropic") {
    return p.baseUrlAnthropic ? "anthropic" : null;
  }

  // apiStyle === "auto": prefer same-protocol, fallback to other.
  if (preferred === "openai") {
    if (p.baseUrlOpenai) return "openai";
    if (p.baseUrlAnthropic) return "anthropic";
  } else {
    if (p.baseUrlAnthropic) return "anthropic";
    if (p.baseUrlOpenai) return "openai";
  }
  return null;
}

export async function dispatchChat(
  modelId: string,
  messages: NormalizedChatRequest["messages"],
  user: UserOverrides,
  ctx: DispatchContext,
  extra?: Pick<NormalizedChatRequest, "extraParams" | "rawMessages">,
): Promise<DispatchSuccess> {
  // Check API key token quota before doing any work.
  if (keyTokenBuffer.isQuotaExceeded(ctx.apiKeyId, 1)) {
    throw new ApiKeyQuotaExceededError(ctx.apiKeyName);
  }

  const model = await loadModel(modelId);
  // Fetch all enabled candidates and split by protocol compatibility.
  const all = await providerModelRepo.findCandidates(modelId);
  const sameProtocol = all.filter(
    (c) => candidateApiMode(c, ctx.apiModeIn) === ctx.apiModeIn,
  );
  let sorted = selectCandidates(sameProtocol);
  // If no same-protocol candidates, try cross-protocol.
  if (sorted.length === 0) {
    const crossProtocol = all.filter(
      (c) =>
        candidateApiMode(c, ctx.apiModeIn) !== null &&
        candidateApiMode(c, ctx.apiModeIn) !== ctx.apiModeIn,
    );
    sorted = selectCandidates(crossProtocol);
  }
  if (sorted.length === 0) {
    throw new NoCandidateError(
      modelId,
      all.length > 0 ? "all providers quota exhausted" : undefined,
    );
  }

  // Apply sticky routing: move the last-used provider to the front.
  const sticky = await getStickyProvider(ctx.apiKeyId, modelId);
  if (sticky) {
    const idx = sorted.findIndex((c) => c.provider.id === sticky.providerId);
    if (idx > 0) {
      const [stickyCandidate] = sorted.splice(idx, 1);
      sorted.unshift(stickyCandidate);
    }
  }

  const failures: { providerId: string; status: number; message: string }[] =
    [];

  for (const c of sorted) {
    trackQuotaExhaustedRetry(c);
    const params = resolveModelParams(model, c.provider, c.pm, user);
    // Determine which protocol this candidate actually supports.
    const apiModeOut = candidateApiMode(c, ctx.apiModeIn) ?? ctx.apiModeIn;
    const isCrossProtocol = apiModeOut !== ctx.apiModeIn;
    const adapter = getAdapter(apiModeOut);
    // Translate extraParams when crossing protocols.
    const effectiveExtra = isCrossProtocol
      ? translateRequestExtraParams(
          {
            messages,
            stream: false,
            realModelId: params.realModelId,
            maxTokens: params.maxTokens,
            temperature: params.temperature,
            topP: params.topP,
            topK: params.topK,
            reasoningEffort: params.reasoningEffort,
            ...(extra?.extraParams ? { extraParams: extra.extraParams } : {}),
          },
          ctx.apiModeIn,
          apiModeOut,
        )
      : null;
    const extraParams = effectiveExtra?.extraParams ?? extra?.extraParams;
    const req: NormalizedChatRequest = {
      messages,
      stream: false,
      realModelId: params.realModelId,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
      topP: params.topP,
      topK: params.topK,
      reasoningEffort: params.reasoningEffort,
      stop: extraParams?.stop as string[] | undefined,
      tools: extraParams?.tools,
      tool_choice: extraParams?.tool_choice,
      extraParams,
      rawMessages: extra?.rawMessages,
    };
    const started = Date.now();
    activeRequests.incr(c.provider.id);
    const requestId = emitMetricsStart({
      ts: started,
      apiKeyId: ctx.apiKeyId,
      modelId,
      providerId: c.provider.id,
      providerName: c.provider.name,
      realModelId: params.realModelId,
      apiModeIn: ctx.apiModeIn,
      apiModeOut,
      stream: false,
      status: 0,
      errorCode: null,
      ttftMs: null,
      tpsOut: null,
      latencyMs: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      ip: ctx.ip,
      apiKeyName: ctx.apiKeyName,
      userAgent: ctx.userAgent,
    });
    try {
      const resp = await adapter.chat(
        resolveProvider(c.provider, apiModeOut),
        req,
        ctx.signal,
      );
      // Translate response back to client's protocol if cross-protocol.
      if (isCrossProtocol) {
        const translated = translateResponse(
          resp,
          modelId,
          apiModeOut,
          ctx.apiModeIn,
        );
        // Replace rawMessage with the translated format so the route handler
        // can build the final response in the client's protocol.
        (resp as unknown as Record<string, unknown>).rawMessage = translated;
      }
      const latency = Date.now() - started;
      emitMetrics({
        requestId: requestId ?? undefined,
        ts: started,
        apiKeyId: ctx.apiKeyId,
        modelId,
        providerId: c.provider.id,
        providerName: c.provider.name,
        realModelId: params.realModelId,
        apiModeIn: ctx.apiModeIn,
        apiModeOut,
        stream: false,
        status: 200,
        errorCode: null,
        ttftMs: latency,
        tpsOut:
          resp.usage.outputTokens > 0 && latency > 0
            ? (resp.usage.outputTokens / latency) * 1000
            : null,
        latencyMs: latency,
        inputTokens: resp.usage.inputTokens,
        cachedInputTokens: resp.usage.cachedInputTokens,
        outputTokens: resp.usage.outputTokens,
        ip: ctx.ip,
        apiKeyName: ctx.apiKeyName,
        userAgent: ctx.userAgent,
      });
      // Best effort counter accounting; request success should not fail on quota write.
      try {
        if (c.provider.usageMode === "token") {
          await providerRepo.incrementQuotaUsedByTokens(
            c.provider.id,
            resp.usage.inputTokens,
            resp.usage.cachedInputTokens,
            resp.usage.outputTokens,
            c.pm.feeRateInput ?? 1,
            c.pm.feeRateCachedInput ?? 0.1,
            c.pm.feeRateOutput ?? 4,
          );
        } else {
          await providerRepo.incrementQuotaUsedByRequest(
            c.provider.id,
            c.pm.feeRateInput ?? 1,
          );
        }
      } catch {
        /* never block successful response on quota counter write */
      }
      // Record API key token usage (buffered, flushed by cron).
      const totalKeyTokens =
        resp.usage.inputTokens +
        resp.usage.cachedInputTokens +
        resp.usage.outputTokens;
      keyTokenBuffer.increment(ctx.apiKeyId, totalKeyTokens);
      // Record sticky routing for future requests from this key.
      // Fire-and-forget — never block the response on sticky write.
      setStickyProvider(
        ctx.apiKeyId,
        modelId,
        c.provider.id,
        c.pm.id,
        env.STICKY_TTL_MS,
      ).catch(() => {});
      return { response: resp, provider: c.provider, pm: c.pm, params };
    } catch (err) {
      activeRequests.decr(c.provider.id);
      const status = err instanceof UpstreamError ? err.status : 0;
      const message = err instanceof Error ? err.message : "Unknown";
      failures.push({ providerId: c.provider.id, status, message });
      emitMetrics({
        requestId: requestId ?? undefined,
        ts: started,
        apiKeyId: ctx.apiKeyId,
        modelId,
        providerId: c.provider.id,
        providerName: c.provider.name,
        realModelId: params.realModelId,
        apiModeIn: ctx.apiModeIn,
        apiModeOut: apiModeOut,
        stream: false,
        status: status || 500,
        errorCode: message.slice(0, 200),
        ttftMs: null,
        tpsOut: null,
        latencyMs: Date.now() - started,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        ip: ctx.ip,
        apiKeyName: ctx.apiKeyName,
        userAgent: ctx.userAgent,
      });
      if (isRetryable(err)) {
        markTransientFailure(c.provider.id);
        continue;
      }
      // Non-retryable error: forward the original upstream error to the client.
      const upstreamStatus =
        err instanceof UpstreamError ? err.status : undefined;
      const upstreamBody =
        err instanceof UpstreamError ? err.bodyText : undefined;
      throw new AllCandidatesFailedError(
        modelId,
        failures,
        upstreamStatus,
        upstreamBody,
      );
    }
  }
  throw new AllCandidatesFailedError(modelId, failures);
}

export interface DispatchStreamResult {
  /** First-token latency once the iterator yields its first non-empty delta. */
  iterator: AsyncIterable<NormalizedChunk>;
  /** Provider+params chosen, available immediately. */
  provider: ProviderRow;
  pm: ProviderModelRow;
  params: ResolvedParams;
  /** When cross-protocol, this is the upstream's protocol. The route handler
   *  should skip rawDelta/rawAnthropicEvent passthrough and use normalized
   *  fields only. undefined when same-protocol (passthrough mode). */
  apiModeOut?: ApiMode;
}

export async function dispatchChatStream(
  modelId: string,
  messages: NormalizedChatRequest["messages"],
  user: UserOverrides,
  ctx: DispatchContext,
  extra?: Pick<NormalizedChatRequest, "extraParams" | "rawMessages">,
): Promise<DispatchStreamResult> {
  // Check API key token quota before doing any work.
  if (keyTokenBuffer.isQuotaExceeded(ctx.apiKeyId, 1)) {
    throw new ApiKeyQuotaExceededError(ctx.apiKeyName);
  }

  const model = await loadModel(modelId);
  // Fetch all enabled candidates and split by protocol compatibility.
  const all = await providerModelRepo.findCandidates(modelId);
  const sameProtocol = all.filter(
    (c) => candidateApiMode(c, ctx.apiModeIn) === ctx.apiModeIn,
  );
  let sorted = selectCandidates(sameProtocol);
  // If no same-protocol candidates, try cross-protocol.
  if (sorted.length === 0) {
    const crossProtocol = all.filter(
      (c) =>
        candidateApiMode(c, ctx.apiModeIn) !== null &&
        candidateApiMode(c, ctx.apiModeIn) !== ctx.apiModeIn,
    );
    sorted = selectCandidates(crossProtocol);
  }
  if (sorted.length === 0) {
    throw new NoCandidateError(
      modelId,
      all.length > 0 ? "all providers quota exhausted" : undefined,
    );
  }

  // Apply sticky routing: move the last-used provider to the front.
  const sticky = await getStickyProvider(ctx.apiKeyId, modelId);
  if (sticky) {
    const idx = sorted.findIndex((c) => c.provider.id === sticky.providerId);
    if (idx > 0) {
      const [stickyCandidate] = sorted.splice(idx, 1);
      sorted.unshift(stickyCandidate);
    }
  }

  // For streaming we commit to the first candidate (we can't easily fall back
  // mid-stream once headers are flushed). We pre-flight the first chunk to
  // confirm the upstream accepted, then fall back if it didn't.
  const failures: { providerId: string; status: number; message: string }[] =
    [];

  for (const c of sorted) {
    trackQuotaExhaustedRetry(c);
    const params = resolveModelParams(model, c.provider, c.pm, user);
    // Determine which protocol this candidate actually supports.
    const apiModeOut = candidateApiMode(c, ctx.apiModeIn) ?? ctx.apiModeIn;
    const isCrossProtocol = apiModeOut !== ctx.apiModeIn;
    const adapter = getAdapter(apiModeOut);
    // Translate extraParams when crossing protocols.
    const effectiveExtra = isCrossProtocol
      ? translateRequestExtraParams(
          {
            messages,
            stream: true,
            realModelId: params.realModelId,
            maxTokens: params.maxTokens,
            temperature: params.temperature,
            topP: params.topP,
            topK: params.topK,
            reasoningEffort: params.reasoningEffort,
            ...(extra?.extraParams ? { extraParams: extra.extraParams } : {}),
          },
          ctx.apiModeIn,
          apiModeOut,
        )
      : null;
    const extraParams = effectiveExtra?.extraParams ?? extra?.extraParams;
    const req: NormalizedChatRequest = {
      messages,
      stream: true,
      realModelId: params.realModelId,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
      topP: params.topP,
      topK: params.topK,
      reasoningEffort: params.reasoningEffort,
      stop: extraParams?.stop as string[] | undefined,
      tools: extraParams?.tools,
      tool_choice: extraParams?.tool_choice,
      extraParams,
      rawMessages: extra?.rawMessages,
    };
    const started = Date.now();
    activeRequests.incr(c.provider.id);
    const requestId = emitMetricsStart({
      ts: started,
      apiKeyId: ctx.apiKeyId,
      modelId,
      providerId: c.provider.id,
      providerName: c.provider.name,
      realModelId: params.realModelId,
      apiModeIn: ctx.apiModeIn,
      apiModeOut,
      stream: true,
      status: 0,
      errorCode: null,
      ttftMs: null,
      tpsOut: null,
      latencyMs: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      ip: ctx.ip,
      apiKeyName: ctx.apiKeyName,
      userAgent: ctx.userAgent,
    });
    try {
      const src = adapter.chatStream(
        resolveProvider(c.provider, apiModeOut),
        req,
        ctx.signal,
      );
      // Peek first iteration to detect immediate errors.
      const wrapped = wrapStream(src, {
        started,
        requestId,
        ctx,
        modelId,
        provider: c.provider,
        pm: c.pm,
        params,
      });
      return {
        iterator: wrapped,
        provider: c.provider,
        pm: c.pm,
        params,
        ...(isCrossProtocol ? { apiModeOut } : {}),
      };
    } catch (err) {
      activeRequests.decr(c.provider.id);
      const status = err instanceof UpstreamError ? err.status : 0;
      failures.push({
        providerId: c.provider.id,
        status,
        message: err instanceof Error ? err.message : "Unknown",
      });
      if (isRetryable(err)) {
        markTransientFailure(c.provider.id);
        continue;
      }
      // Non-retryable error: forward the original upstream error to the client.
      const upstreamStatus =
        err instanceof UpstreamError ? err.status : undefined;
      const upstreamBody =
        err instanceof UpstreamError ? err.bodyText : undefined;
      throw new AllCandidatesFailedError(
        modelId,
        failures,
        upstreamStatus,
        upstreamBody,
      );
    }
  }
  throw new AllCandidatesFailedError(modelId, failures);
}

function wrapStream(
  src: AsyncIterable<NormalizedChunk>,
  ctx: {
    started: number;
    requestId: number | null;
    ctx: DispatchContext;
    modelId: string;
    provider: ProviderRow;
    pm: ProviderModelRow;
    params: ResolvedParams;
  },
): AsyncIterable<NormalizedChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      let ttft: number | null = null;
      let usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
      let streamOutputTokens = 0;
      let finishReason: string | null = null;
      let status = 200;
      let errorCode: string | null = null;
      try {
        for await (const chunk of src) {
          if ((chunk.delta || chunk.toolCallsDelta != null) && ttft == null) {
            ttft = Date.now() - ctx.started;
            // Immediately update the log row with TTFT so it's visible
            // before the stream completes.
            if (ctx.requestId != null) {
              emitMetricsUpdate(ctx.requestId, ctx.started, {
                status: 200,
                ttftMs: ttft,
              });
            }
          }
          if (chunk.delta) streamOutputTokens++;
          // Adopt usage from the final chunk. Adapters now always yield a
          // concrete object (even {0,0,0}) so this reliably captures
          // provider-reported token counts for every stream.
          if (chunk.usage) usage = chunk.usage;
          if (chunk.finishReason) finishReason = chunk.finishReason;
          yield chunk;
        }
      } catch (err) {
        status = err instanceof UpstreamError ? err.status : 500;
        errorCode =
          err instanceof Error ? err.message.slice(0, 200) : "Unknown";
        throw err;
      } finally {
        activeRequests.decr(ctx.provider.id);
        const latency = Date.now() - ctx.started;
        const outTokens = streamOutputTokens || usage.outputTokens;
        const tps =
          outTokens > 0 && ttft != null && latency > ttft
            ? (outTokens / (latency - ttft)) * 1000
            : null;
        emitMetrics({
          requestId: ctx.requestId ?? undefined,
          ts: ctx.started,
          apiKeyId: ctx.ctx.apiKeyId,
          modelId: ctx.modelId,
          providerId: ctx.provider.id,
          providerName: ctx.provider.name,
          realModelId: ctx.params.realModelId,
          apiModeIn: ctx.ctx.apiModeIn,
          apiModeOut: ctx.ctx.apiModeIn,
          stream: true,
          status,
          errorCode,
          ttftMs: ttft,
          tpsOut: tps,
          latencyMs: latency,
          inputTokens: usage.inputTokens,
          cachedInputTokens: usage.cachedInputTokens,
          outputTokens: outTokens,
          ip: ctx.ctx.ip,
          apiKeyName: ctx.ctx.apiKeyName,
          userAgent: ctx.ctx.userAgent,
        });
        if (status === 200) {
          // Streaming request completed successfully; count one successful call.
          try {
            if (ctx.provider.usageMode === "token") {
              await providerRepo.incrementQuotaUsedByTokens(
                ctx.provider.id,
                usage.inputTokens,
                usage.cachedInputTokens,
                outTokens,
                ctx.pm.feeRateInput ?? 1,
                ctx.pm.feeRateCachedInput ?? 0.1,
                ctx.pm.feeRateOutput ?? 4,
              );
            } else {
              await providerRepo.incrementQuotaUsedByRequest(
                ctx.provider.id,
                ctx.pm.feeRateInput ?? 1,
              );
            }
          } catch {
            /* never block stream completion on quota counter write */
          }
          // Record API key token usage (buffered, flushed by cron).
          const totalKeyTokens =
            usage.inputTokens + usage.cachedInputTokens + outTokens;
          keyTokenBuffer.increment(ctx.ctx.apiKeyId, totalKeyTokens);
          // Record sticky routing for future requests from this key.
          // Fire-and-forget — never block the stream on sticky write.
          setStickyProvider(
            ctx.ctx.apiKeyId,
            ctx.modelId,
            ctx.provider.id,
            ctx.pm.id,
            env.STICKY_TTL_MS,
          ).catch(() => {});
        }
        // Touch finishReason to avoid "unused" lint complaint.
        void finishReason;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Direct routing: provider/model bypass (works even on disabled providers)
// ---------------------------------------------------------------------------

export async function dispatchDirectChat(
  providerId: string,
  modelId: string,
  messages: NormalizedChatRequest["messages"],
  user: UserOverrides,
  ctx: DispatchContext,
  extra?: Pick<NormalizedChatRequest, "extraParams" | "rawMessages">,
): Promise<DispatchSuccess> {
  const c = await providerModelRepo.findDirect(providerId, modelId);
  if (!c) {
    throw new NoCandidateError(
      `${providerId}/${modelId}`,
      "provider-model pair not found",
    );
  }
  const model = await modelRepo.findById(modelId);
  if (!model) throw new NoCandidateError(modelId, "model not found");
  const params = resolveModelParams(model, c.provider, c.pm, user);
  const adapter = getAdapter(ctx.apiModeIn);
  const req: NormalizedChatRequest = {
    messages,
    stream: false,
    realModelId: params.realModelId,
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    topP: params.topP,
    topK: params.topK,
    reasoningEffort: params.reasoningEffort,
    stop: extra?.extraParams?.stop as string[] | undefined,
    tools: extra?.extraParams?.tools,
    tool_choice: extra?.extraParams?.tool_choice,
    extraParams: extra?.extraParams,
    rawMessages: extra?.rawMessages,
  };
  const started = Date.now();
  activeRequests.incr(c.provider.id);
  const requestId = emitMetricsStart({
    ts: started,
    apiKeyId: ctx.apiKeyId,
    modelId,
    providerId: c.provider.id,
    providerName: c.provider.name,
    realModelId: params.realModelId,
    apiModeIn: ctx.apiModeIn,
    apiModeOut: ctx.apiModeIn,
    stream: false,
    status: 0,
    errorCode: null,
    ttftMs: null,
    tpsOut: null,
    latencyMs: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    ip: ctx.ip,
    apiKeyName: ctx.apiKeyName,
    userAgent: ctx.userAgent,
  });
  try {
    const resp = await adapter.chat(
      resolveProvider(c.provider, ctx.apiModeIn),
      req,
    );
    const latency = Date.now() - started;
    emitMetrics({
      requestId: requestId ?? undefined,
      ts: started,
      apiKeyId: ctx.apiKeyId,
      modelId,
      providerId: c.provider.id,
      providerName: c.provider.name,
      realModelId: params.realModelId,
      apiModeIn: ctx.apiModeIn,
      apiModeOut: ctx.apiModeIn,
      stream: false,
      status: 200,
      errorCode: null,
      ttftMs: latency,
      tpsOut:
        resp.usage.outputTokens > 0 && latency > 0
          ? (resp.usage.outputTokens / latency) * 1000
          : null,
      latencyMs: latency,
      inputTokens: resp.usage.inputTokens,
      cachedInputTokens: resp.usage.cachedInputTokens,
      outputTokens: resp.usage.outputTokens,
      ip: ctx.ip,
      apiKeyName: ctx.apiKeyName,
      userAgent: ctx.userAgent,
    });
    try {
      if (c.provider.usageMode === "token") {
        await providerRepo.incrementQuotaUsedByTokens(
          c.provider.id,
          resp.usage.inputTokens,
          resp.usage.cachedInputTokens,
          resp.usage.outputTokens,
          c.pm.feeRateInput ?? 1,
          c.pm.feeRateCachedInput ?? 0.1,
          c.pm.feeRateOutput ?? 4,
        );
      } else {
        await providerRepo.incrementQuotaUsedByRequest(
          c.provider.id,
          c.pm.feeRateInput ?? 1,
        );
      }
    } catch {
      /* never block */
    }
    return { response: resp, provider: c.provider, pm: c.pm, params };
  } catch (err) {
    activeRequests.decr(c.provider.id);
    const status = err instanceof UpstreamError ? err.status : 0;
    const message = err instanceof Error ? err.message : "Unknown";
    emitMetrics({
      requestId: requestId ?? undefined,
      ts: started,
      apiKeyId: ctx.apiKeyId,
      modelId,
      providerId: c.provider.id,
      providerName: c.provider.name,
      realModelId: params.realModelId,
      apiModeIn: ctx.apiModeIn,
      apiModeOut: ctx.apiModeIn,
      stream: false,
      status: status || 500,
      errorCode: message.slice(0, 200),
      ttftMs: null,
      tpsOut: null,
      latencyMs: Date.now() - started,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      ip: ctx.ip,
      apiKeyName: ctx.apiKeyName,
      userAgent: ctx.userAgent,
    });
    const upstreamStatus =
      err instanceof UpstreamError ? err.status : undefined;
    const upstreamBody =
      err instanceof UpstreamError ? err.bodyText : undefined;
    throw new AllCandidatesFailedError(
      modelId,
      [{ providerId: c.provider.id, status, message }],
      upstreamStatus,
      upstreamBody,
    );
  }
}

export async function dispatchDirectChatStream(
  providerId: string,
  modelId: string,
  messages: NormalizedChatRequest["messages"],
  user: UserOverrides,
  ctx: DispatchContext,
  extra?: Pick<NormalizedChatRequest, "extraParams" | "rawMessages">,
): Promise<DispatchStreamResult> {
  const c = await providerModelRepo.findDirect(providerId, modelId);
  if (!c) {
    throw new NoCandidateError(
      `${providerId}/${modelId}`,
      "provider-model pair not found",
    );
  }
  const model = await modelRepo.findById(modelId);
  if (!model) throw new NoCandidateError(modelId, "model not found");
  const params = resolveModelParams(model, c.provider, c.pm, user);
  const adapter = getAdapter(ctx.apiModeIn);
  const req: NormalizedChatRequest = {
    messages,
    stream: true,
    realModelId: params.realModelId,
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    topP: params.topP,
    topK: params.topK,
    reasoningEffort: params.reasoningEffort,
    stop: extra?.extraParams?.stop as string[] | undefined,
    tools: extra?.extraParams?.tools,
    tool_choice: extra?.extraParams?.tool_choice,
    extraParams: extra?.extraParams,
    rawMessages: extra?.rawMessages,
  };
  const started = Date.now();
  activeRequests.incr(c.provider.id);
  const requestId = emitMetricsStart({
    ts: started,
    apiKeyId: ctx.apiKeyId,
    modelId,
    providerId: c.provider.id,
    providerName: c.provider.name,
    realModelId: params.realModelId,
    apiModeIn: ctx.apiModeIn,
    apiModeOut: ctx.apiModeIn,
    stream: true,
    status: 0,
    errorCode: null,
    ttftMs: null,
    tpsOut: null,
    latencyMs: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    ip: ctx.ip,
    apiKeyName: ctx.apiKeyName,
    userAgent: ctx.userAgent,
  });
  try {
    const src = adapter.chatStream(
      resolveProvider(c.provider, ctx.apiModeIn),
      req,
      ctx.signal,
    );
    const wrapped = wrapStream(src, {
      started,
      requestId,
      ctx,
      modelId,
      provider: c.provider,
      pm: c.pm,
      params,
    });
    return { iterator: wrapped, provider: c.provider, pm: c.pm, params };
  } catch (err) {
    activeRequests.decr(c.provider.id);
    throw err;
  }
}
