import { requireAdmin } from "../_lib/guard";
import { recentLogs } from "@/lib/metrics/queryRouter";
import { providerRepo } from "@/lib/repositories/providerRepo";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const now = Date.now();
  const hour = 3_600_000;
  const day = 86_400_000;
  const week = 7 * day;
  const month = 30 * day;

  // Request counts per time window — recentLogs() returns { rows, total }
  // where total is the actual count before limit/offset.
  const requestCounts = {
    hour: recentLogs({ from: now - hour, limit: 1, days: 1 }).total,
    day: recentLogs({ from: now - day, limit: 1, days: 2 }).total,
    week: recentLogs({ from: now - week, limit: 1, days: 8 }).total,
    month: recentLogs({ from: now - month, limit: 1, days: 31 }).total,
  };

  // Model counts (last 7 days)
  const allLogs = recentLogs({ limit: 10000, days: 7 });
  const modelMap = new Map<string, number>();
  for (const row of allLogs.rows) {
    modelMap.set(row.model_id, (modelMap.get(row.model_id) ?? 0) + 1);
  }

  // Quota summary
  const providers = await providerRepo.list();
  const total = providers.length;
  const nearLimit = providers.filter((p) => p.quotaRunningOut).length;

  // Model counts sorted descending
  const modelCounts = [...modelMap.entries()]
    .map(([model_id, requests]) => ({ model_id, requests }))
    .sort((a, b) => b.requests - a.requests);

  return Response.json({
    requestCounts,
    quotaSummary: { total, nearLimit },
    modelCounts,
  });
}
