import { env } from "@/lib/env";
import { dateKey, shardStore } from "@/lib/metrics/shardStore";
import { metricsBuffer, type RequestLogRecord } from "@/lib/metrics/buffer";

/**
 * Insert a new in-flight request log row directly into the shard DB.
 * Returns the autoincrement row ID so the caller can later update it.
 */
export function logRequestStart(record: RequestLogRecord): number {
  const k = dateKey(new Date(record.ts));
  const db = shardStore.openLog(k);
  const result = db
    .prepare(
      `INSERT INTO request_log
       (ts, api_key_id, model_id, provider_id, real_model_id,
        api_mode_in, api_mode_out, stream, status, error_code,
        ttft_ms, tps_out, latency_ms,
        input_tokens, cached_input_tokens, output_tokens, ip,
        user_agent, api_key_name, provider_name, completed, aborted)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      record.ts,
      record.apiKeyId,
      record.modelId,
      record.providerId,
      record.realModelId,
      record.apiModeIn,
      record.apiModeOut,
      record.stream ? 1 : 0,
      0, // status=0 means in-flight
      null,
      null,
      null,
      0,
      0,
      0,
      0,
      record.ip,
      record.userAgent,
      record.apiKeyName,
      record.providerName,
      0, // completed=0 means in-flight
      0, // aborted=0 means not aborted
    );
  return Number(result.lastInsertRowid);
}

/**
 * Immediately update an existing request_log row in the shard DB.
 * Used for early updates (e.g. TTFT) before the request completes.
 */
export function logRequestUpdate(
  requestId: number,
  ts: number,
  fields: {
    status?: number;
    ttftMs?: number | null;
    tpsOut?: number | null;
    latencyMs?: number;
    inputTokens?: number;
    cachedInputTokens?: number;
    outputTokens?: number;
    errorCode?: string | null;
    completed?: boolean;
    aborted?: boolean;
  },
): void {
  const k = dateKey(new Date(ts));
  const db = shardStore.openLog(k);
  db.prepare(
    `UPDATE request_log SET
       status = COALESCE(?, status),
       ttft_ms = COALESCE(?, ttft_ms),
       tps_out = COALESCE(?, tps_out),
       latency_ms = COALESCE(?, latency_ms),
       input_tokens = COALESCE(?, input_tokens),
       cached_input_tokens = COALESCE(?, cached_input_tokens),
       output_tokens = COALESCE(?, output_tokens),
       error_code = COALESCE(?, error_code),
       completed = MAX(COALESCE(?, completed), completed),
       aborted = MAX(COALESCE(?, aborted), aborted)
     WHERE id = ?`,
  ).run(
    fields.status ?? null,
    fields.ttftMs ?? null,
    fields.tpsOut ?? null,
    fields.latencyMs ?? null,
    fields.inputTokens ?? null,
    fields.cachedInputTokens ?? null,
    fields.outputTokens ?? null,
    fields.errorCode ?? null,
    fields.completed != null ? (fields.completed ? 1 : 0) : null,
    fields.aborted != null ? (fields.aborted ? 1 : 0) : null,
    requestId,
  );
}

export function flushOnce(): number {
  const batch = metricsBuffer.drain(env.METRICS_FLUSH_BATCH_SIZE);
  if (batch.length === 0) return 0;

  // Group by date so we hit the right per-day shard.
  const byDate = new Map<string, RequestLogRecord[]>();
  for (const r of batch) {
    const k = dateKey(new Date(r.ts));
    let arr = byDate.get(k);
    if (!arr) {
      arr = [];
      byDate.set(k, arr);
    }
    arr.push(r);
  }

  for (const [k, recs] of byDate) {
    const db = shardStore.openLog(k);

    // Separate completion updates (have requestId) from new inserts.
    const inserts = recs.filter((r) => r.requestId == null);
    const updates = recs.filter((r) => r.requestId != null);

    if (inserts.length > 0) {
      const stmt = db.prepare(
        `INSERT INTO request_log
         (ts, api_key_id, model_id, provider_id, real_model_id,
          api_mode_in, api_mode_out, stream, status, error_code,
          ttft_ms, tps_out, latency_ms,
          input_tokens, cached_input_tokens, output_tokens, ip,
          user_agent, api_key_name, provider_name, completed, aborted)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      );
      const tx = db.transaction((rows: RequestLogRecord[]) => {
        for (const r of rows) {
          stmt.run(
            r.ts,
            r.apiKeyId,
            r.modelId,
            r.providerId,
            r.realModelId,
            r.apiModeIn,
            r.apiModeOut,
            r.stream ? 1 : 0,
            r.status,
            r.errorCode,
            r.ttftMs,
            r.tpsOut,
            r.latencyMs,
            r.inputTokens,
            r.cachedInputTokens,
            r.outputTokens,
            r.ip,
            r.userAgent,
            r.apiKeyName,
            r.providerName,
            r.completed ? 1 : 0,
            r.aborted ? 1 : 0,
          );
        }
      });
      tx(inserts);
    }

    if (updates.length > 0) {
      const stmt = db.prepare(
        `UPDATE request_log SET
           status = ?,
           error_code = ?,
           ttft_ms = ?,
           tps_out = ?,
           latency_ms = ?,
           input_tokens = ?,
           cached_input_tokens = ?,
           output_tokens = ?,
           completed = MAX(COALESCE(?, completed), completed),
           aborted = MAX(COALESCE(?, aborted), aborted)
         WHERE id = ?`,
      );
      const tx = db.transaction((rows: RequestLogRecord[]) => {
        for (const r of rows) {
          stmt.run(
            r.status,
            r.errorCode,
            r.ttftMs,
            r.tpsOut,
            r.latencyMs,
            r.inputTokens,
            r.cachedInputTokens,
            r.outputTokens,
            r.completed != null ? (r.completed ? 1 : 0) : null,
            r.aborted != null ? (r.aborted ? 1 : 0) : null,
            r.requestId,
          );
        }
      });
      tx(updates);
    }
  }
  return batch.length;
}
