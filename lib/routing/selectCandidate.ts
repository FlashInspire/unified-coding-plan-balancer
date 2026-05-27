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

// Score weights — must sum to 1.0
const W_QUOTA = 0.5;
const W_WEIGHT = 0.3;
const W_RANDOM = 0.2;

/**
 * Routing selection using a composite weighted score.
 *
 * Algorithm:
 * 1. Drop unhealthy, transiently-failing, and exhausted candidates.
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
  const eligible = candidates.filter(
    (c) =>
      c.healthy &&
      !isInFailureWindow(c.provider.id) &&
      (c.usagePercent ?? 0) < env.QUOTA_EXHAUST_THRESHOLD,
  );

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
