/**
 * Cron task — keep AggregateReport `latest=true` rows pointing at the
 * current period.
 *
 * AggregateReport rows are written **incrementally** in real time by
 * `lib/metrics/liveReportUpdater.ts`: every completed API call increments
 * the row whose (granularity, providerId, modelId, apiKeyId, latest=true)
 * matches its dimension tuple, creating one if it does not yet exist.
 *
 * This means there is no need to scan `request_log` after the fact to
 * regenerate hour/day/week/month aggregates. The only thing the cron tick
 * has to do is **retire** `latest=true` rows whose `periodStart` is older
 * than the current aligned period — typically because the period rolled
 * over during a quiet window with no traffic. The next API call will then
 * see no `latest=true` row for the current period and create one.
 *
 * This runs every cron tick and is dirt-cheap: at most four single-row
 * `UPDATE`s per granularity (each backed by an index on `latest`).
 */
import { prisma } from "@/lib/prisma";
import { truncateToGranularity } from "@/lib/metrics/reportAggregator";
import type { CronTaskContext, CronTaskResult } from "./types";

type Granularity = "hour" | "day" | "week" | "month";
const GRANULARITIES: Granularity[] = ["hour", "day", "week", "month"];

export async function runEnsureLatestReportsTask(
  ctx: CronTaskContext,
): Promise<CronTaskResult> {
  const retired: Record<Granularity, number> = {
    hour: 0,
    day: 0,
    week: 0,
    month: 0,
  };

  // Run all four updates in parallel; each touches only stale rows
  // matched by the (granularity, providerId, modelId, apiKeyId, latest)
  // composite index.
  await Promise.all(
    GRANULARITIES.map(async (gran) => {
      const currentPeriodStart = BigInt(truncateToGranularity(ctx.now, gran));
      const result = await prisma.aggregateReport.updateMany({
        where: {
          granularity: gran,
          latest: true,
          periodStart: { lt: currentPeriodStart },
        },
        data: { latest: false },
      });
      retired[gran] = result.count;
    }),
  );

  return { retired };
}
