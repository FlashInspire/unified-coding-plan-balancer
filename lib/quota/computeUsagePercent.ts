export interface QuotaUsageInput {
  rollingQuota: number | null;
  rollingQuotaUsed: number;
  weekQuota: number | null;
  weekQuotaUsed: number;
  monthQuota: number | null;
  monthQuotaUsed: number;
  // Token-mode extra counters (only present when usageMode = "token")
  usageMode?: "request" | "token";
  rollingCacheInputTokensUsed?: number;
  rollingOutputTokensUsed?: number;
  weekCacheInputTokensUsed?: number;
  weekOutputTokensUsed?: number;
  monthCacheInputTokensUsed?: number;
  monthOutputTokensUsed?: number;
}

/**
 * Computes usagePercent from provider counters.
 *
 * Rules:
 * - null quota means unlimited for that dimension and is ignored.
 * - zero quota means unlimited for that dimension and is ignored.
 * - the tightest remaining dimension dominates the overall usage.
 * - In token mode, "used" = inputUsed + cachedInputUsed + outputUsed.
 */
export function computeQuotaUsagePercent(
  input: QuotaUsageInput,
): number | null {
  const percentCandidates: number[] = [];
  const isToken = input.usageMode === "token";

  addQuotaPercent(
    percentCandidates,
    input.rollingQuota,
    isToken
      ? input.rollingQuotaUsed +
          (input.rollingCacheInputTokensUsed ?? 0) +
          (input.rollingOutputTokensUsed ?? 0)
      : input.rollingQuotaUsed,
  );
  addQuotaPercent(
    percentCandidates,
    input.weekQuota,
    isToken
      ? input.weekQuotaUsed +
          (input.weekCacheInputTokensUsed ?? 0) +
          (input.weekOutputTokensUsed ?? 0)
      : input.weekQuotaUsed,
  );
  addQuotaPercent(
    percentCandidates,
    input.monthQuota,
    isToken
      ? input.monthQuotaUsed +
          (input.monthCacheInputTokensUsed ?? 0) +
          (input.monthOutputTokensUsed ?? 0)
      : input.monthQuotaUsed,
  );

  if (percentCandidates.length === 0) return null;
  return Math.max(...percentCandidates);
}

function addQuotaPercent(
  out: number[],
  quota: number | null,
  used: number,
): void {
  if (quota == null || quota <= 0) return;

  const nonNegativeUsed = Math.max(0, used);
  const remaining = Math.max(quota - nonNegativeUsed, 0);
  const usagePercent = ((quota - remaining) / quota) * 100;
  out.push(usagePercent);
}
