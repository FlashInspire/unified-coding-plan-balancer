/**
 * Fee Pipeline — unified entry point.
 *
 * On each successful API call, dispatch invokes `recordUsage(input)` which:
 *   1. Computes fees via `computeAll()`
 *   2. Fires off Provider quota update (async, best-effort)
 *   3. Buffers User dimension increments (flushed by cron)
 *   4. Buffers ApiKey dimension increments (flushed by cron)
 *
 * This replaces the scattered logic that was previously in dispatch.ts:
 *   - providerRepo.incrementQuotaUsedByTokens()
 *   - userTokenBuffer.increment()
 */

import { computeAll, computeProviderDimensionFee } from "./compute";
import { providerRepo } from "@/lib/repositories/providerRepo";
import { adminUserRepo } from "@/lib/repositories/adminUserRepo";
import { apiKeyDimensionBuffer } from "./api-key-buffer";
import type { FeePipelineInput, FeePipelineResult } from "./types";

/**
 * Record usage for a successful API call.
 *
 * All side-effects are best-effort and never throw — a failed quota write
 * must not block or fail the client's response.
 */
export async function recordUsage(
  input: FeePipelineInput,
): Promise<FeePipelineResult> {
  const result = computeAll(input);

  // ── 1. Provider quota (async, best-effort) ─────────────────────
  try {
    if (input.providerUsageMode === "token") {
      const dimFee = computeProviderDimensionFee(input);
      await providerRepo.incrementQuotaUsedByTokens(
        input.providerId,
        dimFee.inputCost,
        dimFee.cachedCost,
        dimFee.outputCost,
      );
    } else {
      await providerRepo.incrementQuotaUsedByRequest(
        input.providerId,
        input.feeRateInput,
      );
    }
  } catch {
    /* never block successful response on quota counter write */
  }

  // ── 2. User quota — direct write of weighted fee total ────────
  if (input.userId) {
    try {
      await adminUserRepo.incrementUserQuotaUsed(input.userId, result.userFee);
    } catch {
      /* never block successful response on quota counter write */
    }
  }

  // ── 3. API key dimension buffer (in-memory, flushed by cron) ───
  apiKeyDimensionBuffer.increment(
    input.apiKeyId,
    input.inputTokens,
    input.cachedReadTokens + input.cacheWriteTokens,
    input.outputTokens,
  );

  return result;
}
