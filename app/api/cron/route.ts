/**
 * GET /api/cron — Unified cron endpoint.
 *
 * Called every 60 seconds by an external scheduler (Vercel Cron, Uptime Kuma,
 * systemd timer, etc.). Each invocation runs the following jobs:
 *
 * 1. flush        — drain in-memory request log buffer → request_log table
 * 2. staleLogs    — mark request_log rows pending > 1h as completed + aborted
 * 3. aggregate    — aggregate the previous minute's logs into usage_minute
 * 4. keyTokenFlush — flush buffered API key token increments to DB
 * 5. reset        — reset expired provider & key quota counters
 * 6. archive      — purge expired log/stat rows (once per day)
 * 7. aggregateReports — generate hour/day/week/month aggregate reports
 */
import { flushOnce } from "@/lib/metrics/flusher";
import {
  aggregateMinute,
  getLastAggregatedMinute,
  setLastAggregatedMinute,
} from "@/lib/metrics/aggregator";
import {
  aggregateReports,
  ensureLatestPeriods,
} from "@/lib/metrics/reportAggregator";
import { archiveOnce } from "@/lib/metrics/archiver";
import { cleanupStaleLogs } from "@/lib/metrics/staleLogCleaner";
import { resetTick } from "@/lib/quota/reset-scheduler";
import { userDimensionBuffer } from "@/lib/fee-pipeline/user-buffer";
import { apiKeyDimensionBuffer } from "@/lib/fee-pipeline/api-key-buffer";
import { adminUserRepo } from "@/lib/repositories/adminUserRepo";
import { apiKeyRepo } from "@/lib/repositories/apiKeyRepo";

/** Last time archive was run (epoch ms). 0 = never. */
let lastArchiveAt = 0;
const ARCHIVE_INTERVAL_MS = 24 * 3600 * 1000;

export async function GET(): Promise<Response> {
  const ts = Date.now();
  const jobs: Record<string, unknown> = {};

  // 1. Flush request log buffer
  try {
    const flushed = await flushOnce();
    jobs.flush = { records: flushed };
  } catch (err) {
    jobs.flush = { error: err instanceof Error ? err.message : "unknown" };
  }

  // 1b. Mark stale (>1h pending) logs as completed + aborted
  try {
    const stale = await cleanupStaleLogs(ts);
    jobs.staleLogs = stale;
  } catch (err) {
    jobs.staleLogs = {
      error: err instanceof Error ? err.message : "unknown",
    };
  }

  //

  // 2. Aggregate previous minute
  try {
    const previousMinute = Math.floor((ts - 5_000) / 60_000) - 1;
    const lastMin = getLastAggregatedMinute();
    let aggregated = 0;
    // Aggregate all minutes from lastMin+1 up to previousMinute (gap-fill).
    for (let m = lastMin + 1; m <= previousMinute; m++) {
      await aggregateMinute(m);
      setLastAggregatedMinute(m);
      aggregated++;
    }
    jobs.aggregate = { minutes: aggregated };
  } catch (err) {
    jobs.aggregate = { error: err instanceof Error ? err.message : "unknown" };
  }

  // 3. Flush user dimension buffer to DB
  try {
    const drained = userDimensionBuffer.drain();
    if (drained.size > 0) {
      await adminUserRepo.flushDimensionIncrements(drained);
    }
    jobs.userTokenFlush = { users: drained.size };
  } catch (err) {
    jobs.userTokenFlush = {
      error: err instanceof Error ? err.message : "unknown",
    };
  }

  // 3b. Flush API key dimension buffer to DB
  try {
    const keyDrained = apiKeyDimensionBuffer.drain();
    if (keyDrained.size > 0) {
      await apiKeyRepo.flushDimensionIncrements(keyDrained);
    }
    jobs.apiKeyFlush = { keys: keyDrained.size };
  } catch (err) {
    jobs.apiKeyFlush = {
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
      const result = await archiveOnce();
      lastArchiveAt = ts;
      jobs.archive = result;
    } else {
      jobs.archive = { skipped: true };
    }
  } catch (err) {
    jobs.archive = { error: err instanceof Error ? err.message : "unknown" };
  }

  // 6. Ensure latest aggregate report periods are current (retire stale flags)
  try {
    await ensureLatestPeriods(ts);
    jobs.ensureLatestPeriods = { ok: true };
  } catch (err) {
    jobs.ensureLatestPeriods = {
      error: err instanceof Error ? err.message : "unknown",
    };
  }

  // 7. Aggregate reports (hour/day gap-fill, week/month once per day)
  try {
    const reportResult = await aggregateReports(ts);
    jobs.aggregateReports = reportResult;
  } catch (err) {
    jobs.aggregateReports = {
      error: err instanceof Error ? err.message : "unknown",
    };
  }

  return Response.json({ ok: true, ts, jobs });
}
