/**
 * Cron task — mark request_log rows pending > 1h as completed + aborted.
 */
import { cleanupStaleLogs } from "@/lib/metrics/staleLogCleaner";
import type { CronTaskContext, CronTaskResult } from "./types";

export async function runStaleLogsTask(
  ctx: CronTaskContext,
): Promise<CronTaskResult> {
  return cleanupStaleLogs(ctx.now);
}
