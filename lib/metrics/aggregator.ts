/**
 * Aggregates the previous minute's request_log rows into per-(minute, key, provider, model)
 * usage_minute rows. Called by the cron endpoint every 60 seconds.
 */
import {
  dateKey,
  listShards,
  monthKey,
  shardStore,
} from "@/lib/metrics/shardStore";

/** Epoch minute of the last successful aggregation. */
let lastAggregatedMinute = 0;

export function getLastAggregatedMinute(): number {
  return lastAggregatedMinute;
}

export function setLastAggregatedMinute(minute: number): void {
  lastAggregatedMinute = minute;
}

interface MinuteRow {
  api_key_id: string;
  provider_id: string;
  model_id: string;
  requests: number;
  requests_ok: number;
  requests_err: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  ttft_ms_sum: number;
  ttft_ms_count: number;
  tps_out_sum: number;
  tps_out_count: number;
}

export function aggregateMinute(minuteEpoch: number): number {
  const minuteStartMs = minuteEpoch * 60_000;
  const minuteEndMs = minuteStartMs + 60_000;
  const dayKey = dateKey(new Date(minuteStartMs));
  const monKey = monthKey(new Date(minuteStartMs));

  const logDb = shardStore.openLog(dayKey);
  const rows = logDb
    .prepare(
      `SELECT api_key_id, provider_id, model_id,
              COUNT(*) AS requests,
              SUM(CASE WHEN status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS requests_ok,
              SUM(CASE WHEN status NOT BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS requests_err,
              COALESCE(SUM(input_tokens), 0)        AS input_tokens,
              COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
              COALESCE(SUM(output_tokens), 0)       AS output_tokens,
              COALESCE(SUM(ttft_ms), 0)             AS ttft_ms_sum,
              SUM(CASE WHEN ttft_ms IS NOT NULL THEN 1 ELSE 0 END) AS ttft_ms_count,
              -- tps_out = outputTokens / generationTime, only output generation speed
              COALESCE(SUM(tps_out), 0)             AS tps_out_sum,
              SUM(CASE WHEN tps_out IS NOT NULL THEN 1 ELSE 0 END) AS tps_out_count
         FROM request_log
        WHERE ts >= ? AND ts < ?
        GROUP BY api_key_id, provider_id, model_id`,
    )
    .all(minuteStartMs, minuteEndMs) as MinuteRow[];

  if (rows.length === 0) return 0;

  const statDb = shardStore.openStat(monKey);
  const up = statDb.prepare(
    `INSERT INTO usage_minute
       (minute, api_key_id, provider_id, model_id,
        requests, requests_ok, requests_err,
        input_tokens, cached_input_tokens, output_tokens,
        ttft_ms_sum, ttft_ms_count, tps_out_sum, tps_out_count)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(minute, api_key_id, provider_id, model_id) DO UPDATE SET
       requests=requests+excluded.requests,
       requests_ok=requests_ok+excluded.requests_ok,
       requests_err=requests_err+excluded.requests_err,
       input_tokens=input_tokens+excluded.input_tokens,
       cached_input_tokens=cached_input_tokens+excluded.cached_input_tokens,
       output_tokens=output_tokens+excluded.output_tokens,
       ttft_ms_sum=ttft_ms_sum+excluded.ttft_ms_sum,
       ttft_ms_count=ttft_ms_count+excluded.ttft_ms_count,
       tps_out_sum=tps_out_sum+excluded.tps_out_sum,
       tps_out_count=tps_out_count+excluded.tps_out_count`,
  );
  const tx = statDb.transaction((rs: MinuteRow[]) => {
    for (const r of rs) {
      up.run(
        minuteEpoch,
        r.api_key_id,
        r.provider_id,
        r.model_id,
        r.requests,
        r.requests_ok,
        r.requests_err,
        r.input_tokens,
        r.cached_input_tokens,
        r.output_tokens,
        r.ttft_ms_sum,
        r.ttft_ms_count,
        r.tps_out_sum,
        r.tps_out_count,
      );
    }
  });
  tx(rows);
  return rows.length;
}

export { listShards };
