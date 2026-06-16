/**
 * Aggregate report generator — computes and upserts AggregateReport rows
 * at hour/day/week/month granularity, dimensioned by (providerId, modelId, apiKeyId).
 *
 * Called by the cron endpoint at different cadences:
 *   - hour/day: gap-fill every 60 seconds
 *   - week/month: once per day
 */
import { prisma } from "@/lib/prisma";

type Granularity = "hour" | "day" | "week" | "month";

/** In-memory state: last successfully aggregated period start (epoch ms) per granularity. */
const lastAggregated: Record<Granularity, number> = {
  hour: 0,
  day: 0,
  week: 0,
  month: 0,
};

const lastWeekMonthAt = 0;
let _lastWeekMonthAt = lastWeekMonthAt;

export function getLastAggregated(g: Granularity): number {
  return lastAggregated[g];
}

export function setLastAggregated(g: Granularity, ms: number): void {
  lastAggregated[g] = ms;
}

export function getLastWeekMonthAt(): number {
  return _lastWeekMonthAt;
}

export function setLastWeekMonthAt(ms: number): void {
  _lastWeekMonthAt = ms;
}

// ---------------------------------------------------------------------------
// Period boundary helpers
// ---------------------------------------------------------------------------

/** Truncate an epoch-ms timestamp to the start of the given granularity. */
export function truncateToGranularity(ts: number, g: Granularity): number {
  const d = new Date(ts);
  switch (g) {
    case "hour":
      d.setUTCMinutes(0, 0, 0);
      return d.getTime();
    case "day":
      d.setUTCHours(0, 0, 0, 0);
      return d.getTime();
    case "week": {
      // Monday 00:00 UTC
      d.setUTCHours(0, 0, 0, 0);
      const dow = d.getUTCDay(); // 0=Sun, 1=Mon, …
      const diff = (dow + 6) % 7; // days since last Monday
      d.setUTCDate(d.getUTCDate() - diff);
      return d.getTime();
    }
    case "month":
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      return d.getTime();
  }
}

/** Return the duration (ms) of one period of the given granularity. */
function periodDurationMs(g: Granularity, anchor: number): number {
  switch (g) {
    case "hour":
      return 3_600_000;
    case "day":
      return 86_400_000;
    case "week":
      return 7 * 86_400_000;
    case "month": {
      const d = new Date(anchor);
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      const next = new Date(Date.UTC(y, m + 1, 1));
      return next.getTime() - anchor;
    }
  }
}

// ---------------------------------------------------------------------------
// Core aggregation
// ---------------------------------------------------------------------------

interface GroupedRow {
  api_key_id: string;
  provider_id: string;
  model_id: string;
  provider_name: string | null;
  model_name: string | null;
  api_key_name: string | null;
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

/**
 * Query request_log for a time range, group by (provider, model, key),
 * and upsert into aggregate_report.
 */
async function aggregateRange(
  startMs: number,
  endMs: number,
  granularity: Granularity,
): Promise<number> {
  // Use $queryRaw for efficient grouped aggregation.
  // Names are taken from request_log (MAX = arbitrary representative); empty
  // strings are normalised to NULL via NULLIF so the display layer can fall
  // back to the underlying id.
  const rows = await prisma.$queryRaw<GroupedRow[]>`
    SELECT provider_id, model_id, api_key_id,
           NULLIF(MAX(provider_name), '') as provider_name,
           NULLIF(MAX(model_name), '') as model_name,
           NULLIF(MAX(api_key_name), '') as api_key_name,
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
     WHERE ts >= ${BigInt(startMs)} AND ts < ${BigInt(endMs)}
     GROUP BY provider_id, model_id, api_key_id`;

  if (rows.length === 0) return 0;

  // Resolve missing names from the live Provider / Model / ApiKey tables so
  // first-time aggregations of legacy logs still get a sensible label.
  const missingProviderIds = [
    ...new Set(rows.filter((r) => !r.provider_name).map((r) => r.provider_id)),
  ];
  const missingModelIds = [
    ...new Set(rows.filter((r) => !r.model_name).map((r) => r.model_id)),
  ];
  const missingApiKeyIds = [
    ...new Set(rows.filter((r) => !r.api_key_name).map((r) => r.api_key_id)),
  ];
  const [providerLookup, modelLookup, apiKeyLookup] = await Promise.all([
    missingProviderIds.length > 0
      ? prisma.provider.findMany({
          where: { id: { in: missingProviderIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    missingModelIds.length > 0
      ? prisma.model.findMany({
          where: { id: { in: missingModelIds } },
          select: { id: true, displayName: true },
        })
      : Promise.resolve([]),
    missingApiKeyIds.length > 0
      ? prisma.apiKey.findMany({
          where: { id: { in: missingApiKeyIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const providerNameMap = new Map(providerLookup.map((p) => [p.id, p.name]));
  const modelNameMap = new Map(modelLookup.map((m) => [m.id, m.displayName]));
  const apiKeyNameMap = new Map(apiKeyLookup.map((k) => [k.id, k.name]));

  const resolveName = (
    name: string | null,
    fallback: string | undefined,
  ): string | null => {
    if (name && name.trim() !== "") return name;
    if (fallback && fallback.trim() !== "") return fallback;
    return null;
  };

  // Upsert each grouped row into aggregate_report.
  // ON CONFLICT we use COALESCE(EXCLUDED.<name>, aggregate_report.<name>) so a
  // null incoming name does NOT clobber a previously-stored name.
  for (const r of rows) {
    const providerName = resolveName(
      r.provider_name,
      providerNameMap.get(r.provider_id),
    );
    const modelName = resolveName(r.model_name, modelNameMap.get(r.model_id));
    const apiKeyName = resolveName(
      r.api_key_name,
      apiKeyNameMap.get(r.api_key_id),
    );
    await prisma.$executeRaw`
      INSERT INTO aggregate_report
        (granularity, period_start, provider_id, provider_name, model_id, model_name, api_key_id, api_key_name,
         requests, requests_ok, requests_err,
         input_tokens, cached_input_tokens, output_tokens,
         ttft_ms_sum, ttft_ms_count, tps_out_sum, tps_out_count)
      VALUES
        (${granularity}, ${BigInt(startMs)}, ${r.provider_id}, ${providerName}, ${r.model_id}, ${modelName}, ${r.api_key_id}, ${apiKeyName},
         ${r.requests}, ${r.requests_ok}, ${r.requests_err},
         ${r.input_tokens}, ${r.cached_input_tokens}, ${r.output_tokens},
         ${Number(r.ttft_ms_sum)}, ${r.ttft_ms_count}, ${r.tps_out_sum}, ${r.tps_out_count})
      ON CONFLICT (granularity, period_start, provider_id, model_id, api_key_id)
      DO UPDATE SET
        provider_name = COALESCE(EXCLUDED.provider_name, aggregate_report.provider_name),
        model_name = COALESCE(EXCLUDED.model_name, aggregate_report.model_name),
        api_key_name = COALESCE(EXCLUDED.api_key_name, aggregate_report.api_key_name),
        requests = aggregate_report.requests + EXCLUDED.requests,
        requests_ok = aggregate_report.requests_ok + EXCLUDED.requests_ok,
        requests_err = aggregate_report.requests_err + EXCLUDED.requests_err,
        input_tokens = aggregate_report.input_tokens + EXCLUDED.input_tokens,
        cached_input_tokens = aggregate_report.cached_input_tokens + EXCLUDED.cached_input_tokens,
        output_tokens = aggregate_report.output_tokens + EXCLUDED.output_tokens,
        ttft_ms_sum = aggregate_report.ttft_ms_sum + EXCLUDED.ttft_ms_sum,
        ttft_ms_count = aggregate_report.ttft_ms_count + EXCLUDED.ttft_ms_count,
        tps_out_sum = aggregate_report.tps_out_sum + EXCLUDED.tps_out_sum,
        tps_out_count = aggregate_report.tps_out_count + EXCLUDED.tps_out_count`;
  }

  return rows.length;
}

// ---------------------------------------------------------------------------
// Public aggregation functions
// ---------------------------------------------------------------------------

export async function aggregateHour(hourStartMs: number): Promise<number> {
  const endMs = hourStartMs + 3_600_000;
  return aggregateRange(hourStartMs, endMs, "hour");
}

export async function aggregateDay(dayStartMs: number): Promise<number> {
  const endMs = dayStartMs + 86_400_000;
  return aggregateRange(dayStartMs, endMs, "day");
}

export async function aggregateWeek(weekStartMs: number): Promise<number> {
  const endMs = weekStartMs + 7 * 86_400_000;
  return aggregateRange(weekStartMs, endMs, "week");
}

export async function aggregateMonth(monthStartMs: number): Promise<number> {
  const d = new Date(monthStartMs);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const endMs = new Date(Date.UTC(y, m + 1, 1)).getTime();
  return aggregateRange(monthStartMs, endMs, "month");
}

// ---------------------------------------------------------------------------
// Period rollover: ensure stale latest=true rows are retired
// ---------------------------------------------------------------------------

/**
 * For each granularity, find all `latest=true` rows whose `periodStart` is
 * older than the current aligned period, and flip them to `latest=false`.
 *
 * New `latest=true` rows for the current period are created on-demand by
 * `updateLatestReports()` when the next API call arrives.
 *
 * Called from /api/cron on every tick so that stale flags are cleaned up
 * even during quiet periods with no incoming requests.
 */
export async function ensureLatestPeriods(now: number): Promise<void> {
  const granularities: Granularity[] = ["hour", "day", "week", "month"];
  for (const gran of granularities) {
    const currentPeriodStart = BigInt(truncateToGranularity(now, gran));
    try {
      await prisma.aggregateReport.updateMany({
        where: {
          granularity: gran,
          latest: true,
          periodStart: { lt: currentPeriodStart },
        },
        data: { latest: false },
      });
    } catch {
      /* best-effort — never crash cron */
    }
  }
}

// ---------------------------------------------------------------------------
// Orchestrator: called from /api/cron
// ---------------------------------------------------------------------------

interface AggregateReportsResult {
  hours: number;
  days: number;
  weeks: number;
  months: number;
  hoursAggregated: number;
  daysAggregated: number;
  weeksAggregated: number;
  monthsAggregated: number;
}

const WEEK_MONTH_INTERVAL_MS = 24 * 3600 * 1000;

/**
 * Gap-fill aggregate reports for all granularities.
 *
 * - hour/day: gap-fill for all complete periods since last run
 * - week/month: run once per day
 */
export async function aggregateReports(
  now: number,
): Promise<AggregateReportsResult> {
  const result: AggregateReportsResult = {
    hours: 0,
    days: 0,
    weeks: 0,
    months: 0,
    hoursAggregated: 0,
    daysAggregated: 0,
    weeksAggregated: 0,
    monthsAggregated: 0,
  };

  // ── Hour gap-fill ────────────────────────────────────────────────
  const currentHourStart = truncateToGranularity(now, "hour");
  // Only aggregate completed hours (i.e. before the current hour)
  const hourEnd = currentHourStart;
  let h = lastAggregated.hour || truncateToGranularity(now - 3_600_000, "hour");
  // On first run, start from 2 hours ago
  if (h === 0) h = truncateToGranularity(now - 2 * 3_600_000, "hour");

  while (h < hourEnd) {
    const count = await aggregateHour(h);
    result.hoursAggregated += count;
    result.hours++;
    setLastAggregated("hour", h);
    h += 3_600_000;
  }

  // ── Day gap-fill ─────────────────────────────────────────────────
  const currentDayStart = truncateToGranularity(now, "day");
  const dayEnd = currentDayStart;
  let d = lastAggregated.day || truncateToGranularity(now - 86_400_000, "day");
  if (d === 0) d = truncateToGranularity(now - 2 * 86_400_000, "day");

  while (d < dayEnd) {
    const count = await aggregateDay(d);
    result.daysAggregated += count;
    result.days++;
    setLastAggregated("day", d);
    d += 86_400_000;
  }

  // ── Week / Month: once per day ───────────────────────────────────
  if (now - _lastWeekMonthAt >= WEEK_MONTH_INTERVAL_MS) {
    // Week: aggregate the most recently completed week
    const currentWeekStart = truncateToGranularity(now, "week");
    const lastWeekStart = currentWeekStart - 7 * 86_400_000;
    if (lastWeekStart > lastAggregated.week) {
      const count = await aggregateWeek(lastWeekStart);
      result.weeksAggregated += count;
      result.weeks++;
      setLastAggregated("week", lastWeekStart);
    }

    // Month: aggregate the most recently completed month
    const currentMonthStart = truncateToGranularity(now, "month");
    const prevMonthDate = new Date(currentMonthStart);
    prevMonthDate.setUTCMonth(prevMonthDate.getUTCMonth() - 1);
    const lastMonthStart = prevMonthDate.getTime();
    if (lastMonthStart > lastAggregated.month) {
      const count = await aggregateMonth(lastMonthStart);
      result.monthsAggregated += count;
      result.months++;
      setLastAggregated("month", lastMonthStart);
    }

    setLastWeekMonthAt(now);
  }

  return result;
}
