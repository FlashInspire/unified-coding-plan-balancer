/**
 * Cron task — purge expired logs/reports. Runs at most once per day.
 */
import { archiveOnce } from "@/lib/metrics/archiver";
import type { CronTaskContext, CronTaskResult } from "./types";

const ARCHIVE_INTERVAL_MS = 24 * 3600 * 1000;

let lastArchiveAt = 0;

export async function runArchiveTask(
  ctx: CronTaskContext,
): Promise<CronTaskResult> {
  if (ctx.now - lastArchiveAt < ARCHIVE_INTERVAL_MS) {
    return { skipped: true };
  }
  const result = await archiveOnce();
  lastArchiveAt = ctx.now;
  return result;
}

/** Test-only — reset the in-process archive cooldown. */
export function _resetArchiveCooldown(): void {
  lastArchiveAt = 0;
}
