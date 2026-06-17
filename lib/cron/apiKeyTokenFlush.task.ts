/**
 * Cron task — flush the API-key dimension token buffer to ApiKey rows.
 */
import { apiKeyDimensionBuffer } from "@/lib/fee-pipeline/api-key-buffer";
import { apiKeyRepo } from "@/lib/repositories/apiKeyRepo";
import type { CronTaskResult } from "./types";

export async function runApiKeyTokenFlushTask(): Promise<CronTaskResult> {
  const drained = apiKeyDimensionBuffer.drain();
  if (drained.size > 0) {
    await apiKeyRepo.flushDimensionIncrements(drained);
  }
  return { keys: drained.size };
}
