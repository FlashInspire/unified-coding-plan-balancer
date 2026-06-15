/**
 * Archiver: deletes old request_log, usage_minute, and aggregate_report rows
 * based on retention policies. Called by the cron endpoint once per day.
 */
import { prisma } from "@/lib/prisma";
import { getRuntimeSettingSync } from "@/lib/env";

export async function archiveOnce(): Promise<{
  logs: number;
  stats: number;
  reports: number;
}> {
  const now = Date.now();

  // ── Purge request_log ────────────────────────────────────────────
  const logRetentionDays = getRuntimeSettingSync("LOG_RETENTION_DAYS");
  const logCutoffMs = BigInt(now - logRetentionDays * 86_400_000);
  const logResult = await prisma.requestLog.deleteMany({
    where: { ts: { lt: logCutoffMs } },
  });

  // ── Purge usage_minute ───────────────────────────────────────────
  const statRetentionMonths = getRuntimeSettingSync("STAT_RETENTION_MONTHS");
  const statCutoffDate = new Date();
  statCutoffDate.setUTCMonth(
    statCutoffDate.getUTCMonth() - statRetentionMonths,
  );
  const statCutoffMinute = Math.floor(statCutoffDate.getTime() / 60_000);
  const statResult = await prisma.usageMinute.deleteMany({
    where: { minute: { lt: statCutoffMinute } },
  });

  // ── Purge aggregate_report ───────────────────────────────────────
  // Hour reports: retain for LOG_RETENTION_DAYS
  const hourCutoffMs = BigInt(now - logRetentionDays * 86_400_000);
  // Day/week/month reports: retain for STAT_RETENTION_MONTHS
  const reportCutoffMs = BigInt(statCutoffDate.getTime());

  const hourResult = await prisma.aggregateReport.deleteMany({
    where: {
      granularity: "hour",
      periodStart: { lt: hourCutoffMs },
    },
  });
  const otherResult = await prisma.aggregateReport.deleteMany({
    where: {
      granularity: { in: ["day", "week", "month"] },
      periodStart: { lt: reportCutoffMs },
    },
  });

  return {
    logs: logResult.count,
    stats: statResult.count,
    reports: hourResult.count + otherResult.count,
  };
}
