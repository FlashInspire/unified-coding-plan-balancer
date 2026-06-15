/**
 * Cross-table read API used by the admin dashboard.
 * All queries go through Prisma to the single PostgreSQL database.
 */
import { prisma } from "@/lib/prisma";

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
  completed: number;
  aborted: number;
}

/** Returns the N most recent request_log rows. */
export async function recentLogs(
  opts: {
    days?: number;
    limit?: number;
    offset?: number;
    apiKeyId?: string;
    apiKeyIds?: string[];
    modelId?: string;
    providerId?: string;
    status?: "ok" | "error" | "inflight";
    search?: string;
    from?: number;
    to?: number;
  } = {},
): Promise<{ rows: RecentLogRow[]; total: number }> {
  const limit = Math.max(1, Math.min(1000, opts.limit ?? 100));
  const offset = Math.max(0, opts.offset ?? 0);

  // Build where clause
  const where: Record<string, unknown> = {};

  if (opts.apiKeyId) {
    where.apiKeyId = opts.apiKeyId;
  } else if (opts.apiKeyIds && opts.apiKeyIds.length > 0) {
    where.apiKeyId = { in: opts.apiKeyIds };
  }
  if (opts.modelId) {
    where.modelId = opts.modelId;
  }
  if (opts.providerId) {
    where.providerId = opts.providerId;
  }
  if (opts.status === "ok") {
    where.status = { gte: 200, lt: 400 };
  } else if (opts.status === "error") {
    where.OR = [{ status: { gte: 400 } }, { status: { gt: 0, lt: 200 } }];
  } else if (opts.status === "inflight") {
    where.status = 0;
  }
  if (opts.search) {
    where.OR = [
      { apiKeyName: { contains: opts.search } },
      { modelId: { contains: opts.search } },
      { providerName: { contains: opts.search } },
      { providerId: { contains: opts.search } },
    ];
  }
  if (opts.from || opts.to) {
    where.ts = {} as Record<string, unknown>;
    if (opts.from)
      (where.ts as Record<string, unknown>).gte = BigInt(opts.from);
    if (opts.to) (where.ts as Record<string, unknown>).lte = BigInt(opts.to);
  }

  const [rows, total] = await Promise.all([
    prisma.requestLog.findMany({
      where: where as never,
      orderBy: { ts: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.requestLog.count({ where: where as never }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: Number(r.id),
      ts: Number(r.ts),
      api_key_id: r.apiKeyId,
      api_key_name: r.apiKeyName ?? "",
      model_id: r.modelId,
      provider_id: r.providerId,
      provider_name: r.providerName,
      status: r.status,
      latency_ms: r.latencyMs,
      ttft_ms: r.ttftMs,
      tps_out: r.tpsOut,
      input_tokens: r.inputTokens,
      cached_input_tokens: r.cachedInputTokens,
      output_tokens: r.outputTokens,
      stream: r.stream ? 1 : 0,
      error_code: r.errorCode,
      user_agent: r.userAgent,
      real_model_id: r.realModelId,
      ip: r.ip,
      completed: r.completed ? 1 : 0,
      aborted: r.aborted ? 1 : 0,
    })),
    total,
  };
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

/** Aggregated usage in a given month. */
export async function usageInMonth(
  monthKey?: string,
  apiKeyIds?: string[],
): Promise<UsageBucket[]> {
  // Compute minute range for the month key (YYYY-MM)
  let startMinute: number;
  let endMinute: number;

  if (monthKey) {
    const [y, m] = monthKey.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    startMinute = Math.floor(start.getTime() / 60_000);
    endMinute = Math.floor(end.getTime() / 60_000);
  } else {
    // Default: current month
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    startMinute = Math.floor(start.getTime() / 60_000);
    endMinute = Math.floor(end.getTime() / 60_000);
  }

  const where: Record<string, unknown> = {
    minute: { gte: startMinute, lt: endMinute },
  };
  if (apiKeyIds && apiKeyIds.length > 0) {
    where.apiKeyId = { in: apiKeyIds };
  }

  const rows = await prisma.usageMinute.findMany({
    where: where as never,
    orderBy: { minute: "desc" },
    take: 5000,
  });

  return rows.map((r) => ({
    minute: r.minute,
    api_key_id: r.apiKeyId,
    provider_id: r.providerId,
    model_id: r.modelId,
    requests: r.requests,
    requests_ok: r.requestsOk,
    requests_err: r.requestsErr,
    input_tokens: r.inputTokens,
    cached_input_tokens: r.cachedInputTokens,
    output_tokens: r.outputTokens,
    avg_ttft_ms: r.ttftMsCount > 0 ? (r.ttftMsSum * 1.0) / r.ttftMsCount : null,
    avg_tps_out: r.tpsOutCount > 0 ? (r.tpsOutSum * 1.0) / r.tpsOutCount : null,
  }));
}

// ---------------------------------------------------------------------------
// Per-API-key token usage aggregation (day / week / month)
// ---------------------------------------------------------------------------

export interface TokenUsageSummary {
  period: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  requests: number;
}

/** Aggregate token usage for a single API key using AggregateReport. */
export async function apiKeyTokenUsage(
  apiKeyId: string,
  period: "day" | "week" | "month",
): Promise<TokenUsageSummary[]> {
  const rows = await prisma.aggregateReport.findMany({
    where: {
      granularity: period,
      apiKeyId,
    },
    orderBy: { periodStart: "desc" },
    take: 500,
  });

  // Group by period key (date string)
  const grouped = new Map<string, TokenUsageSummary>();
  for (const r of rows) {
    const d = new Date(Number(r.periodStart));
    let key: string;
    if (period === "day") {
      key = d.toISOString().slice(0, 10);
    } else if (period === "week") {
      // ISO week
      const temp = new Date(d);
      temp.setUTCDate(temp.getUTCDate() + 3 - ((temp.getUTCDay() + 6) % 7));
      const week1 = new Date(Date.UTC(temp.getUTCFullYear(), 0, 4));
      const weekNum =
        1 +
        Math.round(
          ((temp.getTime() - week1.getTime()) / 86_400_000 -
            3 +
            ((week1.getUTCDay() + 6) % 7)) /
            7,
        );
      key = `${temp.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
    } else {
      key = d.toISOString().slice(0, 7);
    }

    const existing = grouped.get(key);
    if (existing) {
      existing.input_tokens += r.inputTokens;
      existing.cached_input_tokens += r.cachedInputTokens;
      existing.output_tokens += r.outputTokens;
      existing.requests += r.requests;
    } else {
      grouped.set(key, {
        period: key,
        input_tokens: r.inputTokens,
        cached_input_tokens: r.cachedInputTokens,
        output_tokens: r.outputTokens,
        requests: r.requests,
      });
    }
  }

  return [...grouped.values()].sort((a, b) => b.period.localeCompare(a.period));
}

/**
 * Aggregate token usage across multiple months, merging rows with
 * the same period key.
 */
export async function apiKeyTokenUsageMultiMonth(
  apiKeyId: string,
  period: "day" | "week" | "month" = "day",
  _months: number = 3,
): Promise<TokenUsageSummary[]> {
  return apiKeyTokenUsage(apiKeyId, period);
}

// ---------------------------------------------------------------------------
// AggregateReport query API
// ---------------------------------------------------------------------------

export interface AggregateReportRow {
  granularity: string;
  period_start: number;
  provider_id: string;
  model_id: string;
  api_key_id: string;
  requests: number;
  requests_ok: number;
  requests_err: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  avg_ttft_ms: number | null;
  avg_tps_out: number | null;
}

/**
 * Query AggregateReport with flexible filters.
 * Supports filtering by any combination of providerId, modelId, apiKeyId.
 */
export async function aggregateReport(opts: {
  granularity: "hour" | "day" | "week" | "month";
  from?: number;
  to?: number;
  providerId?: string;
  modelId?: string;
  apiKeyId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: AggregateReportRow[]; total: number }> {
  const limit = Math.max(1, Math.min(1000, opts.limit ?? 100));
  const offset = Math.max(0, opts.offset ?? 0);

  const where: Record<string, unknown> = {
    granularity: opts.granularity,
  };
  if (opts.from || opts.to) {
    where.periodStart = {} as Record<string, unknown>;
    if (opts.from)
      (where.periodStart as Record<string, unknown>).gte = BigInt(opts.from);
    if (opts.to)
      (where.periodStart as Record<string, unknown>).lte = BigInt(opts.to);
  }
  if (opts.providerId) where.providerId = opts.providerId;
  if (opts.modelId) where.modelId = opts.modelId;
  if (opts.apiKeyId) where.apiKeyId = opts.apiKeyId;

  const [rows, total] = await Promise.all([
    prisma.aggregateReport.findMany({
      where: where as never,
      orderBy: { periodStart: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.aggregateReport.count({ where: where as never }),
  ]);

  return {
    rows: rows.map((r) => ({
      granularity: r.granularity,
      period_start: Number(r.periodStart),
      provider_id: r.providerId,
      model_id: r.modelId,
      api_key_id: r.apiKeyId,
      requests: r.requests,
      requests_ok: r.requestsOk,
      requests_err: r.requestsErr,
      input_tokens: r.inputTokens,
      cached_input_tokens: r.cachedInputTokens,
      output_tokens: r.outputTokens,
      avg_ttft_ms:
        r.ttftMsCount > 0 ? (r.ttftMsSum * 1.0) / r.ttftMsCount : null,
      avg_tps_out:
        r.tpsOutCount > 0 ? (r.tpsOutSum * 1.0) / r.tpsOutCount : null,
    })),
    total,
  };
}

/**
 * Returns a single aggregated summary (sum of all matching rows).
 * Useful for dashboard cards.
 */
export async function aggregateReportSummary(opts: {
  granularity: "hour" | "day" | "week" | "month";
  from?: number;
  to?: number;
  providerId?: string;
  modelId?: string;
  apiKeyId?: string;
}): Promise<{
  requests: number;
  requests_ok: number;
  requests_err: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
}> {
  const where: Record<string, unknown> = {
    granularity: opts.granularity,
  };
  if (opts.from || opts.to) {
    where.periodStart = {} as Record<string, unknown>;
    if (opts.from)
      (where.periodStart as Record<string, unknown>).gte = BigInt(opts.from);
    if (opts.to)
      (where.periodStart as Record<string, unknown>).lte = BigInt(opts.to);
  }
  if (opts.providerId) where.providerId = opts.providerId;
  if (opts.modelId) where.modelId = opts.modelId;
  if (opts.apiKeyId) where.apiKeyId = opts.apiKeyId;

  const result = await prisma.aggregateReport.aggregate({
    where: where as never,
    _sum: {
      requests: true,
      requestsOk: true,
      requestsErr: true,
      inputTokens: true,
      cachedInputTokens: true,
      outputTokens: true,
    },
  });

  return {
    requests: result._sum.requests ?? 0,
    requests_ok: result._sum.requestsOk ?? 0,
    requests_err: result._sum.requestsErr ?? 0,
    input_tokens: result._sum.inputTokens ?? 0,
    cached_input_tokens: result._sum.cachedInputTokens ?? 0,
    output_tokens: result._sum.outputTokens ?? 0,
  };
}
