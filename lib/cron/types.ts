/**
 * Shared types for cron tasks.
 *
 * Each task in `lib/cron/` exports a `runXxxTask` function that takes the
 * current epoch-ms timestamp and returns a JSON-serialisable result. The
 * orchestrator at `app/api/cron/route.ts` runs them and aggregates the output.
 */

export type CronTaskResult = Record<string, unknown>;

export interface CronTaskContext {
  /** Epoch milliseconds at the start of the cron tick. */
  now: number;
}
