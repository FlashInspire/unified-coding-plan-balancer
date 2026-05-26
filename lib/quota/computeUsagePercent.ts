export interface QuotaUsageInput {
  rollingQuota: number | null;
  rollingQuotaUsed: number;
  weekQuota: number | null;
  weekQuotaUsed: number;
  monthQuota: number | null;
  monthQuotaUsed: number;
}

/**
 * Computes usagePercent from provider counters.
 *
 * Rules:
 * - null quota means unlimited for that dimension and is ignored.
 * - zero quota means unlimited for that dimension and is ignored.
 * - the tightest remaining dimension dominates the overall usage.
 */
export function computeQuotaUsagePercent(
  input: QuotaUsageInput,
): number | null {
  const percentCandidates: number[] = [];

  addQuotaPercent(
    percentCandidates,
    input.rollingQuota,
    input.rollingQuotaUsed,
  );
  addQuotaPercent(percentCandidates, input.weekQuota, input.weekQuotaUsed);
  addQuotaPercent(percentCandidates, input.monthQuota, input.monthQuotaUsed);

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
