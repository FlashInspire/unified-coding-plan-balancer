import { env } from "@/lib/env";
import { dateKey, shardStore } from "@/lib/metrics/shardStore";
import { metricsBuffer, type RequestLogRecord } from "@/lib/metrics/buffer";

let timer: NodeJS.Timeout | null = null;

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
    const stmt = db.prepare(
      `INSERT INTO request_log
       (ts, api_key_id, model_id, provider_id, real_model_id,
        api_mode_in, api_mode_out, stream, status, error_code,
        ttft_ms, tps_out, latency_ms,
        input_tokens, cached_input_tokens, output_tokens, ip,
        user_agent, api_key_name, provider_name)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
        );
      }
    });
    tx(recs);
  }
  return batch.length;
}

export function startFlusher(): void {
  if (timer) return;
  timer = setInterval(() => {
    try {
      flushOnce();
    } catch (err) {
      console.warn(
        "[metrics-flusher]",
        err instanceof Error ? err.message : err,
      );
    }
  }, env.METRICS_FLUSH_INTERVAL_MS);
}

export function stopFlusher(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
