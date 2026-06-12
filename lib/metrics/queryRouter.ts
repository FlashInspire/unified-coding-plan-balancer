/**
 * Cross-shard read API used by the admin dashboard.
 * Picks the right kind of shard based on the requested time window.
 */
import {
  dateKey,
  listShards,
  monthKey,
  shardStore,
} from "@/lib/metrics/shardStore";

export interface RecentLogRow {
  id: number;
  ts: number;
  api_key_id: string;
  api_key_name: string;
  model_id: string;
  provider_id: string;
  provider_name: string | null;
  status: number;
  latency_ms: number;
  ttft_ms: number | null;
  tps_out: number | null;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  stream: number;
  error_code: string | null;
  user_agent: string | null;
  real_model_id: string | null;
  ip: string | null;
}

/** Returns the N most recent request_log rows across the last `days` shards. */
export function recentLogs(
  opts: {
    days?: number;
    limit?: number;
    apiKeyId?: string;
    modelId?: string;
  } = {},
): RecentLogRow[] {
  const days = Math.max(1, opts.days ?? 2);
  const limit = Math.max(1, Math.min(1000, opts.limit ?? 100));
  const shardKeys = listShards("log");
  // Pull the last `days` shards (lexical sort is correct since YYYY-MM-DD).
  const recent = shardKeys.slice(-days);
  const today = dateKey();
  if (!recent.includes(today)) recent.push(today);

  const rows: RecentLogRow[] = [];
  for (const k of recent) {
    try {
      const db = shardStore.openLog(k);
      const res = db
        .prepare(
          `SELECT id, ts, api_key_id, api_key_name, model_id, provider_id,
                  provider_name, status,
                  latency_ms, ttft_ms, tps_out,
                  input_tokens, cached_input_tokens, output_tokens,
                  stream, error_code, user_agent,
                  real_model_id, ip
             FROM request_log
            WHERE (? IS NULL OR api_key_id = ?)
              AND (? IS NULL OR model_id = ?)
            ORDER BY ts DESC
            LIMIT ?`,
        )
        .all(
          opts.apiKeyId ?? null,
          opts.apiKeyId ?? null,
          opts.modelId ?? null,
          opts.modelId ?? null,
          limit,
        ) as RecentLogRow[];
      rows.push(...res);
    } catch {
      /* shard may not exist yet */
    }
  }
  return rows.sort((a, b) => b.ts - a.ts).slice(0, limit);
}

export interface UsageBucket {
  minute: number;
  api_key_id: string;
  provider_id: string;
  model_id: string;
  requests: number;
  requests_ok: number;
  requests_err: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  avg_ttft_ms: number | null;
  avg_tps_out: number | null;
}

/** Aggregated usage in a single month shard. */
export function usageInMonth(
  monthShardKey: string = monthKey(),
): UsageBucket[] {
  try {
    const db = shardStore.openStat(monthShardKey);
    return db
      .prepare(
        `SELECT minute, api_key_id, provider_id, model_id,
                requests, requests_ok, requests_err,
                input_tokens, cached_input_tokens, output_tokens,
                CASE WHEN ttft_ms_count > 0 THEN ttft_ms_sum * 1.0 / ttft_ms_count END AS avg_ttft_ms,
                CASE WHEN tps_out_count > 0 THEN tps_out_sum * 1.0 / tps_out_count END AS avg_tps_out
           FROM usage_minute
           ORDER BY minute DESC
           LIMIT 5000`,
      )
      .all() as UsageBucket[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Per-API-key token usage aggregation (day / week / month)
// ---------------------------------------------------------------------------

export interface TokenUsageSummary {
  period: string; // e.g. "2026-06-11", "2026-W24", "2026-06"
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  requests: number;
}

/** Aggregate token usage for a single API key within one month shard. */
export function apiKeyTokenUsage(
  apiKeyId: string,
  period: "day" | "week" | "month",
  monthShardKey: string = monthKey(),
): TokenUsageSummary[] {
  try {
    const db = shardStore.openStat(monthShardKey);
    let groupExpr: string;
    let selectPeriod: string;
    if (period === "day") {
      groupExpr = "date(minute, 'unixepoch')";
      selectPeriod = "date(minute, 'unixepoch') AS period";
    } else if (period === "week") {
      groupExpr = "strftime('%Y-W%W', minute, 'unixepoch')";
      selectPeriod = "strftime('%Y-W%W', minute, 'unixepoch') AS period";
    } else {
      groupExpr = "strftime('%Y-%m', minute, 'unixepoch')";
      selectPeriod = "strftime('%Y-%m', minute, 'unixepoch') AS period";
    }
    const rows = db
      .prepare(
        `SELECT ${selectPeriod},
                SUM(input_tokens) AS input_tokens,
                SUM(cached_input_tokens) AS cached_input_tokens,
                SUM(output_tokens) AS output_tokens,
                SUM(requests) AS requests
           FROM usage_minute
          WHERE api_key_id = ?
          GROUP BY ${groupExpr}
          ORDER BY period DESC`,
      )
      .all(apiKeyId) as TokenUsageSummary[];
    return rows;
  } catch {
    return [];
  }
}

/**
 * Aggregate token usage across multiple month shards, merging rows with
 * the same period key (e.g. a week that spans two month shards).
 */
export function apiKeyTokenUsageMultiMonth(
  apiKeyId: string,
  period: "day" | "week" | "month" = "day",
  months: number = 3,
): TokenUsageSummary[] {
  const shards = listShards("stat");
  const recent = shards.slice(-months);
  const current = monthKey();
  if (!recent.includes(current)) recent.push(current);

  const all: TokenUsageSummary[] = [];
  for (const shard of recent) {
    all.push(...apiKeyTokenUsage(apiKeyId, period, shard));
  }

  const merged = new Map<string, TokenUsageSummary>();
  for (const row of all) {
    const existing = merged.get(row.period);
    if (existing) {
      existing.input_tokens += row.input_tokens;
      existing.cached_input_tokens += row.cached_input_tokens;
      existing.output_tokens += row.output_tokens;
      existing.requests += row.requests;
    } else {
      merged.set(row.period, { ...row });
    }
  }
  return [...merged.values()].sort((a, b) => b.period.localeCompare(a.period));
}
