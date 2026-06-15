/**
 * GET /api/cron — Unified cron endpoint.
 *
 * Called every 60 seconds by an external scheduler (Vercel Cron, Uptime Kuma,
 * systemd timer, etc.). Each invocation runs the following jobs:
 *
 * 1. flush        — drain in-memory request log buffer → shard DB
 * 2. aggregate    — aggregate the previous minute's logs into usage_minute
 * 3. keyTokenFlush — flush buffered API key token increments to DB
 * 4. reset        — reset expired provider & key quota counters
 * 5. archive      — purge expired log/stat shards (once per day)
 */
import { flushOnce } from "@/lib/metrics/flusher";
import {
  aggregateMinute,
  getLastAggregatedMinute,
  setLastAggregatedMinute,
} from "@/lib/metrics/aggregator";
import { archiveOnce } from "@/lib/metrics/archiver";
import { resetTick } from "@/lib/quota/reset-scheduler";
import { userTokenBuffer } from "@/lib/quota/keyTokenBuffer";
import { adminUserRepo } from "@/lib/repositories/adminUserRepo";

/** Last time archive was run (epoch ms). 0 = never. */
let lastArchiveAt = 0;
const ARCHIVE_INTERVAL_MS = 24 * 3600 * 1000;

export async function GET(): Promise<Response> {
  const ts = Date.now();
  const jobs: Record<string, unknown> = {};

  // 1. Flush request log buffer
  try {
    const flushed = flushOnce();
    jobs.flush = { records: flushed };
  } catch (err) {
    jobs.flush = { error: err instanceof Error ? err.message : "unknown" };
  }

  // 2. Aggregate previous minute
  try {
    const previousMinute = Math.floor((ts - 5_000) / 60_000) - 1;
    const lastMin = getLastAggregatedMinute();
    let aggregated = 0;
    // Aggregate all minutes from lastMin+1 up to previousMinute (gap-fill).
    for (let m = lastMin + 1; m <= previousMinute; m++) {
      aggregateMinute(m);
      setLastAggregatedMinute(m);
      aggregated++;
    }
    jobs.aggregate = { minutes: aggregated };
  } catch (err) {
    jobs.aggregate = { error: err instanceof Error ? err.message : "unknown" };
  }

  // 3. Flush user token buffer to DB
  try {
    const drained = userTokenBuffer.drain();
    if (drained.size > 0) {
      await adminUserRepo.flushTokenIncrements(drained);
    }
    jobs.userTokenFlush = { users: drained.size };
  } catch (err) {
    jobs.userTokenFlush = {
      error: err instanceof Error ? err.message : "unknown",
    };
  }

  // 4. Reset expired quota counters
  try {
    const resetResult = await resetTick();
    jobs.reset = resetResult;
  } catch (err) {
    jobs.reset = { error: err instanceof Error ? err.message : "unknown" };
  }

  // 5. Archive (once per day)
  try {
    if (ts - lastArchiveAt >= ARCHIVE_INTERVAL_MS) {
      const result = archiveOnce();
      lastArchiveAt = ts;
      jobs.archive = result;
    } else {
      jobs.archive = { skipped: true };
    }
  } catch (err) {
    jobs.archive = { error: err instanceof Error ? err.message : "unknown" };
  }

  return Response.json({ ok: true, ts, jobs });
}
