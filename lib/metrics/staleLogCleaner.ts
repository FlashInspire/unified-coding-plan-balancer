/**
 * Stale log cleaner: marks request_log rows that have been pending for more
 * than 1 hour as completed + aborted. Called by the cron endpoint.
 *
 * A row is considered "stale" when it is still `completed = false` an hour
 * after its `ts` timestamp. This usually means the dispatcher crashed or the
 * process was killed before it could write the final metrics, so we close out
 * the record defensively to keep dashboards consistent.
 */
import { prisma } from "@/lib/prisma";

/** Stale threshold: 1 hour in ms. */
const STALE_THRESHOLD_MS = 60 * 60 * 1000;

export async function cleanupStaleLogs(now: number = Date.now()): Promise<{
  updated: number;
}> {
  const cutoffMs = BigInt(now - STALE_THRESHOLD_MS);
  const result = await prisma.requestLog.updateMany({
    where: {
      completed: false,
      ts: { lt: cutoffMs },
    },
    data: {
      completed: true,
      aborted: true,
    },
  });
  return { updated: result.count };
}
