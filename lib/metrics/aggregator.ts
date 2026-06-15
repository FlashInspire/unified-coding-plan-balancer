/**
 * Aggregates the previous minute's request_log rows into per-(minute, key, provider, model)
 * usage_minute rows. Called by the cron endpoint every 60 seconds.
 *
 * Uses raw SQL for efficient grouped aggregation and upsert.
 */
import { prisma } from "@/lib/prisma";

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

export async function aggregateMinute(minuteEpoch: number): Promise<number> {
  const minuteStartMs = BigInt(minuteEpoch * 60_000);
  const minuteEndMs = BigInt((minuteEpoch + 1) * 60_000);

  // Group request_log rows for this minute
  const rows = await prisma.$queryRaw<MinuteRow[]>`
    SELECT api_key_id, provider_id, model_id,
           COUNT(*)::int AS requests,
           SUM(CASE WHEN status BETWEEN 200 AND 299 THEN 1 ELSE 0 END)::int AS requests_ok,
           SUM(CASE WHEN status NOT BETWEEN 200 AND 299 THEN 1 ELSE 0 END)::int AS requests_err,
           COALESCE(SUM(input_tokens), 0)::int AS input_tokens,
           COALESCE(SUM(cached_input_tokens), 0)::int AS cached_input_tokens,
           COALESCE(SUM(output_tokens), 0)::int AS output_tokens,
           COALESCE(SUM(ttft_ms), 0)::bigint AS ttft_ms_sum,
           SUM(CASE WHEN ttft_ms IS NOT NULL THEN 1 ELSE 0 END)::int AS ttft_ms_count,
           COALESCE(SUM(tps_out), 0)::float AS tps_out_sum,
           SUM(CASE WHEN tps_out IS NOT NULL THEN 1 ELSE 0 END)::int AS tps_out_count
      FROM request_log
     WHERE ts >= ${minuteStartMs} AND ts < ${minuteEndMs}
     GROUP BY api_key_id, provider_id, model_id`;

  if (rows.length === 0) return 0;

  // Upsert each grouped row into usage_minute
  for (const r of rows) {
    await prisma.$executeRaw`
      INSERT INTO usage_minute
        (minute, api_key_id, provider_id, model_id,
         requests, requests_ok, requests_err,
         input_tokens, cached_input_tokens, output_tokens,
         ttft_ms_sum, ttft_ms_count, tps_out_sum, tps_out_count)
      VALUES
        (${minuteEpoch}, ${r.api_key_id}, ${r.provider_id}, ${r.model_id},
         ${r.requests}, ${r.requests_ok}, ${r.requests_err},
         ${r.input_tokens}, ${r.cached_input_tokens}, ${r.output_tokens},
         ${Number(r.ttft_ms_sum)}, ${r.ttft_ms_count}, ${r.tps_out_sum}, ${r.tps_out_count})
      ON CONFLICT (minute, api_key_id, provider_id, model_id)
      DO UPDATE SET
        requests = usage_minute.requests + EXCLUDED.requests,
        requests_ok = usage_minute.requests_ok + EXCLUDED.requests_ok,
        requests_err = usage_minute.requests_err + EXCLUDED.requests_err,
        input_tokens = usage_minute.input_tokens + EXCLUDED.input_tokens,
        cached_input_tokens = usage_minute.cached_input_tokens + EXCLUDED.cached_input_tokens,
        output_tokens = usage_minute.output_tokens + EXCLUDED.output_tokens,
        ttft_ms_sum = usage_minute.ttft_ms_sum + EXCLUDED.ttft_ms_sum,
        ttft_ms_count = usage_minute.ttft_ms_count + EXCLUDED.ttft_ms_count,
        tps_out_sum = usage_minute.tps_out_sum + EXCLUDED.tps_out_sum,
        tps_out_count = usage_minute.tps_out_count + EXCLUDED.tps_out_count`;
  }

  return rows.length;
}
