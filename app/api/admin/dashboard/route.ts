import { requireAuth } from "../_lib/guard";
import { aggregateReport, recentLogs } from "@/lib/metrics/queryRouter";
import { apiKeyRepo } from "@/lib/repositories/apiKeyRepo";

export const dynamic = "force-dynamic";

interface BucketRow {
  model_id: string;
  requests: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
}

export async function GET(req: Request): Promise<Response> {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const session = authResult;

  // Non-admin users only see their own API key data.
  const isAdmin = session.user.role === "admin";
  let apiKeyIds: string[] | undefined;
  if (!isAdmin) {
    apiKeyIds = await apiKeyRepo.findIdsByOwner(session.user.id);
    if (apiKeyIds.length === 0) {
      return Response.json({
        requestCounts: { hour: 0, day: 0, week: 0, month: 0 },
        modelCounts: [],
        tokenCounts: [],
      });
    }
  }

  const url = new URL(req.url);
  const period = (url.searchParams.get("period") || "week") as
    | "hour"
    | "day"
    | "week"
    | "month";

  const now = Date.now();
  const hour = 3_600_000;
  const day = 86_400_000;
  const week = 7 * day;
  const month = 30 * day;

  // Request counts per time window
  const [hourResult, dayResult, weekResult, monthResult] = await Promise.all([
    recentLogs({ from: now - hour, limit: 1, days: 1, apiKeyIds }),
    recentLogs({ from: now - day, limit: 1, days: 2, apiKeyIds }),
    recentLogs({ from: now - week, limit: 1, days: 8, apiKeyIds }),
    recentLogs({ from: now - month, limit: 1, days: 31, apiKeyIds }),
  ]);
  const requestCounts = {
    hour: hourResult.total,
    day: dayResult.total,
    week: weekResult.total,
    month: monthResult.total,
  };

  // Model and token counts aggregated from pre-aggregated report data for the selected period
  const periodMs: Record<string, number> = {
    hour,
    day: 24 * hour,
    week: 7 * day,
    month: 30 * day,
  };
  const fromMs = now - (periodMs[period] ?? week);

  const reportResult = await aggregateReport({
    granularity: period,
    from: fromMs,
    to: now,
    apiKeyIds,
    limit: 1000,
    offset: 0,
  });
  const modelMap = new Map<string, BucketRow>();
  for (const row of reportResult.rows) {
    const m = modelMap.get(row.model_id);
    if (m) {
      m.requests += row.requests;
      m.input_tokens += row.input_tokens;
      m.cached_input_tokens += row.cached_input_tokens;
      m.output_tokens += row.output_tokens;
    } else {
      modelMap.set(row.model_id, {
        model_id: row.model_id,
        requests: row.requests,
        input_tokens: row.input_tokens,
        cached_input_tokens: row.cached_input_tokens,
        output_tokens: row.output_tokens,
      });
    }
  }

  // Model counts sorted descending
  const modelCounts = [...modelMap.values()]
    .map(({ model_id, requests }) => ({ model_id, requests }))
    .sort((a, b) => b.requests - a.requests);

  // Token counts sorted by total tokens
  const tokenCounts = [...modelMap.values()]
    .map(({ model_id, input_tokens, cached_input_tokens, output_tokens }) => ({
      model_id,
      input_tokens,
      cached_input_tokens,
      output_tokens,
    }))
    .filter((t) => t.input_tokens + t.cached_input_tokens + t.output_tokens > 0)
    .sort(
      (a, b) =>
        b.input_tokens +
        b.cached_input_tokens +
        b.output_tokens -
        (a.input_tokens + a.cached_input_tokens + a.output_tokens),
    );

  return Response.json({
    requestCounts,
    modelCounts,
    tokenCounts,
  });
}
