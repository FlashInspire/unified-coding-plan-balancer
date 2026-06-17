/**
 * Cron task — drain the in-memory request log buffer into request_log.
 */
import { flushOnce } from "@/lib/metrics/flusher";
import type { CronTaskResult } from "./types";

export async function runFlushTask(): Promise<CronTaskResult> {
  const records = await flushOnce();
  return { records };
}
