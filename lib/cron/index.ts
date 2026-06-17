/**
 * Cron task barrel.
 *
 * The cron orchestrator at `app/api/cron/route.ts` invokes each `runXxxTask`
 * here. Tasks are designed to be idempotent and safe to run every minute.
 *
 * Each task lives in its own `xxx.task.ts` file and returns a small
 * JSON-serialisable result. Failures are caught by the orchestrator so a
 * crash in one task never blocks the others.
 */
export { runFlushTask } from "./flush.task";
export { runStaleLogsTask } from "./staleLogs.task";
export { runUserTokenFlushTask } from "./userTokenFlush.task";
export { runApiKeyTokenFlushTask } from "./apiKeyTokenFlush.task";
export { runQuotaResetTask } from "./quotaReset.task";
export { runArchiveTask } from "./archive.task";
export { runEnsureLatestReportsTask } from "./ensureLatestReports.task";
export type { CronTaskContext, CronTaskResult } from "./types";
