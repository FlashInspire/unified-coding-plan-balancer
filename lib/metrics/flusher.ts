/**
 * Flushes the in-memory metrics buffer to the PostgreSQL request_log table.
 * All records go to a single table — no more sharding.
 */
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { metricsBuffer, type RequestLogRecord } from "@/lib/metrics/buffer";

/**
 * Insert a new in-flight request log row. Returns the row ID for later updates.
 */
export async function logRequestStart(
  record: RequestLogRecord,
): Promise<bigint | null> {
  try {
    const row = await prisma.requestLog.create({
      data: {
        ts: BigInt(record.ts),
        apiKeyId: record.apiKeyId,
        modelId: record.modelId,
        providerId: record.providerId,
        realModelId: record.realModelId,
        apiModeIn: record.apiModeIn,
        apiModeOut: record.apiModeOut,
        stream: record.stream,
        status: 0, // in-flight
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        ip: record.ip,
        userAgent: record.userAgent,
        apiKeyName: record.apiKeyName,
        providerName: record.providerName,
        modelName: record.modelName,
        completed: false,
        aborted: false,
      },
    });
    return row.id;
  } catch {
    return null;
  }
}

/**
 * Immediately update an existing request_log row.
 * Used for early updates (e.g. TTFT) before the request completes.
 */
export async function logRequestUpdate(
  requestId: number,
  _ts: number,
  fields: {
    status?: number;
    ttftMs?: number | null;
    tpsOut?: number | null;
    latencyMs?: number;
    inputTokens?: number;
    cachedReadTokens?: number;
    cacheWriteTokens?: number;
    outputTokens?: number;
    errorCode?: string | null;
    completed?: boolean;
    aborted?: boolean;
  },
): Promise<void> {
  try {
    const data: Record<string, unknown> = {};
    if (fields.status != null) data.status = fields.status;
    if (fields.ttftMs != null) data.ttftMs = fields.ttftMs;
    if (fields.tpsOut != null) data.tpsOut = fields.tpsOut;
    if (fields.latencyMs != null) data.latencyMs = fields.latencyMs;
    if (fields.inputTokens != null) data.inputTokens = fields.inputTokens;
    if (fields.cachedReadTokens != null)
      data.cachedInputTokens = fields.cachedReadTokens;
    if (fields.outputTokens != null) data.outputTokens = fields.outputTokens;
    if (fields.errorCode != null) data.errorCode = fields.errorCode;
    if (fields.completed != null) data.completed = fields.completed;
    if (fields.aborted != null) data.aborted = fields.aborted;

    if (Object.keys(data).length === 0) return;

    await prisma.requestLog.update({
      where: { id: BigInt(requestId) },
      data,
    });
  } catch {
    /* never block on metrics */
  }
}

/**
 * Drain the in-memory buffer and batch-write to PostgreSQL.
 * Inserts and updates are separated since they need different Prisma calls.
 */
export async function flushOnce(): Promise<number> {
  const batch = metricsBuffer.drain(env.METRICS_FLUSH_BATCH_SIZE);
  if (batch.length === 0) return 0;

  // Separate new inserts from completion updates.
  const inserts = batch.filter((r) => r.requestId == null);
  const updates = batch.filter((r) => r.requestId != null);

  // Batch inserts via createMany
  if (inserts.length > 0) {
    await prisma.requestLog.createMany({
      data: inserts.map((r) => ({
        ts: BigInt(r.ts),
        apiKeyId: r.apiKeyId,
        modelId: r.modelId,
        providerId: r.providerId,
        realModelId: r.realModelId,
        apiModeIn: r.apiModeIn,
        apiModeOut: r.apiModeOut,
        stream: r.stream,
        status: r.status ?? 0,
        errorCode: r.errorCode,
        ttftMs: r.ttftMs,
        tpsOut: r.tpsOut,
        latencyMs: r.latencyMs ?? 0,
        inputTokens: r.inputTokens ?? 0,
        cachedInputTokens: r.cachedReadTokens ?? 0,
        outputTokens: r.outputTokens ?? 0,
        ip: r.ip,
        userAgent: r.userAgent,
        apiKeyName: r.apiKeyName,
        providerName: r.providerName,
        modelName: r.modelName,
        completed: r.completed ?? false,
        aborted: r.aborted ?? false,
      })),
    });
  }

  // Updates: Prisma doesn't support batch update with different data,
  // so we use a transaction with individual updates.
  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((r) => {
        const data: Record<string, unknown> = {
          status: r.status,
          errorCode: r.errorCode,
          ttftMs: r.ttftMs,
          tpsOut: r.tpsOut,
          latencyMs: r.latencyMs,
          inputTokens: r.inputTokens,
          cachedInputTokens: r.cachedReadTokens,
          outputTokens: r.outputTokens,
        };
        if (r.completed != null) data.completed = r.completed;
        if (r.aborted != null) data.aborted = r.aborted;

        return prisma.requestLog.update({
          where: { id: BigInt(r.requestId!) },
          data,
        });
      }),
    );
  }

  return batch.length;
}
