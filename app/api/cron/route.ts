/**
 * GET /api/cron — Unified cron endpoint.
 *
 * Called every 60 seconds by an external scheduler (Vercel Cron, Uptime Kuma,
 * systemd timer, etc.). The endpoint dispatches a small set of independent
 * tasks defined in `lib/cron/`. Each task is wrapped in a try/catch so a
 * failure in one never blocks the others.
 *
 * Tasks (see `lib/cron/`):
 *   - flush               drain in-memory request log buffer → request_log
 *   - staleLogs           mark request_log rows pending > 1h as aborted
 *   - userTokenFlush      flush buffered AdminUser dimension increments
 *   - apiKeyTokenFlush    flush buffered ApiKey dimension increments
 *   - quotaReset          reset expired provider/user quota counters
 *   - archive             purge expired logs/reports (cooldown 24h)
 *   - ensureLatestReports retire stale latest=true AggregateReport rows
 *
 * Note: hour/day/week/month aggregates are written **incrementally** by
 * `lib/metrics/liveReportUpdater.ts` on every API call, so the cron does
 * NOT need to re-scan request_log after the fact. The only periodic work
 * for AggregateReport is retiring stale `latest=true` flags after a period
 * boundary, which `ensureLatestReports` does in O(rows-with-stale-flag).
 */
import {
  runFlushTask,
  runStaleLogsTask,
  runUserTokenFlushTask,
  runApiKeyTokenFlushTask,
  runQuotaResetTask,
  runArchiveTask,
  runEnsureLatestReportsTask,
  type CronTaskContext,
  type CronTaskResult,
} from "@/lib/cron";

type TaskFn = (ctx: CronTaskContext) => Promise<CronTaskResult>;

const TASKS: Record<string, TaskFn> = {
  flush: () => runFlushTask(),
  staleLogs: (ctx) => runStaleLogsTask(ctx),
  userTokenFlush: () => runUserTokenFlushTask(),
  apiKeyTokenFlush: () => runApiKeyTokenFlushTask(),
  quotaReset: () => runQuotaResetTask(),
  archive: (ctx) => runArchiveTask(ctx),
  ensureLatestReports: (ctx) => runEnsureLatestReportsTask(ctx),
};

export async function GET(): Promise<Response> {
  const ctx: CronTaskContext = { now: Date.now() };

  // Run every task in parallel — they touch disjoint tables / state, and
  // serial execution was the main reason a single slow task could pin the
  // request for too long.
  const entries = Object.entries(TASKS);
  const results = await Promise.all(
    entries.map(async ([name, run]) => {
      try {
        return [name, await run(ctx)] as const;
      } catch (err) {
        return [
          name,
          { error: err instanceof Error ? err.message : "unknown" },
        ] as const;
      }
    }),
  );

  const jobs = Object.fromEntries(results) as Record<string, CronTaskResult>;
  return Response.json({ ok: true, ts: ctx.now, jobs });
}
