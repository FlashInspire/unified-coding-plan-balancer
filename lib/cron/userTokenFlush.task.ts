/**
 * Cron task — flush the user-dimension token buffer to AdminUser rows.
 */
import { userDimensionBuffer } from "@/lib/fee-pipeline/user-buffer";
import { adminUserRepo } from "@/lib/repositories/adminUserRepo";
import type { CronTaskResult } from "./types";

export async function runUserTokenFlushTask(): Promise<CronTaskResult> {
  const drained = userDimensionBuffer.drain();
  if (drained.size > 0) {
    await adminUserRepo.flushDimensionIncrements(drained);
  }
  return { users: drained.size };
}
