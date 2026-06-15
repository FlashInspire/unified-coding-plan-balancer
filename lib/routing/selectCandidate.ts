import type { RoutingCandidate } from "@/lib/repositories/providerModelRepo";
import { env } from "@/lib/env";

/**
 * In-memory map of providerId -> epoch ms timestamp until which the provider
 * is considered "temporarily failing" and should be deprioritized.
 */
const transientFailures = new Map<string, number>();
const TRANSIENT_WINDOW_MS = 60_000;

export function markTransientFailure(providerId: string): void {
  transientFailures.set(providerId, Date.now() + TRANSIENT_WINDOW_MS);
}

function isInFailureWindow(providerId: string): boolean {
  const until = transientFailures.get(providerId);
  if (!until) return false;
  if (Date.now() > until) {
    transientFailures.delete(providerId);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Quota-exhausted retry tracking
// ---------------------------------------------------------------------------

/**
 * In-memory counter for how many times a quota-exhausted provider has been
 * selected for routing. Once this reaches MAX_QUOTA_RETRIES the provider is
 * marked as "Running out" and excluded from future routing until quota resets.
 */
const quotaExhaustedRetries = new Map<string, number>();

/**
 * In-memory set of provider IDs currently marked as "Running out".
 * Mirrors the DB `quotaRunningOut` field for race-condition-safe routing.
 */
const quotaRunningOutSet = new Set<string>();

/** Increment the retry counter for a quota-exhausted provider. Returns the new count. */
export function incrementQuotaExhaustedRetry(providerId: string): number {
  const next = (quotaExhaustedRetries.get(providerId) ?? 0) + 1;
  quotaExhaustedRetries.set(providerId, next);
  return next;
}

/** Check whether a provider is currently marked as "Running out" (in-memory). */
export function isQuotaRunningOut(providerId: string): boolean {
  return quotaRunningOutSet.has(providerId);
}

/** Mark a provider as "Running out" in the in-memory set. */
export function markQuotaRunningOut(providerId: string): void {
  quotaRunningOutSet.add(providerId);
}

/** Reset the retry counter and "Running out" status for a provider. */
export function resetQuotaRetries(providerId: string): void {
  quotaExhaustedRetries.delete(providerId);
  quotaRunningOutSet.delete(providerId);
  consecutive429Counters.delete(providerId);
}

// ---------------------------------------------------------------------------
// Consecutive 429 tracking
// ---------------------------------------------------------------------------

/**
 * In-memory counter for consecutive upstream 429 responses per provider.
 * When this reaches MAX_CONSECUTIVE_429 the provider is marked as "Running
 * out" and excluded from routing until quota resets. A single successful
 * request resets the counter.
 */
const consecutive429Counters = new Map<string, number>();

/**
 * Increment the consecutive-429 counter for a provider. If the counter
 * reaches the threshold, mark the provider as "Running out" and return true.
 */
export function incrementConsecutive429(providerId: string): boolean {
  const next = (consecutive429Counters.get(providerId) ?? 0) + 1;
  consecutive429Counters.set(providerId, next);
  if (next >= env.MAX_CONSECUTIVE_429) {
    markQuotaRunningOut(providerId);
    return true;
  }
  return false;
}

/** Reset the consecutive-429 counter for a provider (called on success). */
export function resetConsecutive429(providerId: string): void {
  consecutive429Counters.delete(providerId);
}

// Score weights — must sum to 1.0
const W_QUOTA = 0.5;
const W_WEIGHT = 0.3;
const W_RANDOM = 0.2;

/**
 * Routing selection using a composite weighted score.
 *
 * Algorithm:
 * 1. Drop unhealthy, transiently-failing, and "Running out" candidates.
 *    Quota-exhausted providers (usagePercent >= threshold) are NOT filtered
 *    out — they are still eligible but receive a lower score. Only after
 *    MAX_QUOTA_RETRIES consecutive selections of an exhausted provider is it
 *    marked as "Running out" and excluded.
 * 2. For each remaining candidate compute a composite score:
 *    - Quota score (50%): inverse of usagePercent — lower usage = higher score.
 *    - Weight score (30%): normalized provider-model weight — higher = better.
 *    - Random score (20%): uniform random to add jitter.
 * 3. Sort candidates descending by composite score (highest first).
 * 4. Among candidates whose activeRequests differ, prefer lower activeRequests
 *    as a final tiebreaker so load spreads evenly.
 */
export function selectCandidates(
  candidates: RoutingCandidate[],
): RoutingCandidate[] {
  const eligible = candidates.filter((c) => {
    if (!c.healthy) return false;
    if (isInFailureWindow(c.provider.id)) return false;
    // Exclude providers marked as "Running out" (in-memory or DB)
    if (isQuotaRunningOut(c.provider.id) || c.provider.quotaRunningOut)
      return false;
    // If usage has recovered below threshold, clear retry counter
    if ((c.usagePercent ?? 0) < env.QUOTA_EXHAUST_THRESHOLD) {
      resetQuotaRetries(c.provider.id);
    }
    return true;
  });

  if (eligible.length <= 1) return eligible.slice();

  // Find max weight for normalization (avoid division by zero).
  const maxWeight = Math.max(1, ...eligible.map((c) => c.pm.weight | 0 || 1));

  const scored = eligible.map((c) => {
    // Quota score: 0% used → 1.0, 100% used → 0.0
    const quotaScore = 1 - Math.min(1, (c.usagePercent ?? 0) / 100);
    // Weight score: normalized 0..1
    const weightScore = (c.pm.weight | 0 || 1) / maxWeight;
    // Random jitter: 0..1
    const randomScore = Math.random();

    const composite =
      W_QUOTA * quotaScore + W_WEIGHT * weightScore + W_RANDOM * randomScore;

    return { candidate: c, composite };
  });

  scored.sort((a, b) => {
    // Primary: composite score descending
    if (b.composite !== a.composite) return b.composite - a.composite;
    // Secondary: fewer active requests first
    return (
      (a.candidate.activeRequests ?? 0) - (b.candidate.activeRequests ?? 0)
    );
  });

  return scored.map((s) => s.candidate);
}
