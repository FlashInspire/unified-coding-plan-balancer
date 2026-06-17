/**
 * Cron task — reset expired provider/user quota counters.
 */
import { resetTick } from "@/lib/quota/reset-scheduler";
import type { CronTaskResult } from "./types";

export async function runQuotaResetTask(): Promise<CronTaskResult> {
  const r = await resetTick();
  return { providersReset: r.providersReset, keysReset: r.keysReset };
}
