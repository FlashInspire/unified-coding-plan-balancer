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

/**
 * Routing selection.
 *
 * Algorithm:
 * 1. Drop unhealthy and transiently-failing candidates.
 * 2. Group remaining candidates by `usagePercent` (null is normalized to 0,
 *    so providers without a quota source are treated as "fully fresh" and
 *    sit at the top of the list).
 * 3. Order groups ascending by usage (least-used first).
 * 4. Within a group, sort by `activeRequests` ascending (least busy first).
 * 5. Within the same activeRequests level, shuffle by weight (Fisher–Yates).
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

  // Bucket by quantized usagePercent (1-decimal precision is enough to avoid
  // floating-point noise creating spurious "different" buckets).
  const buckets = new Map<number, RoutingCandidate[]>();
  for (const c of eligible) {
    const key = Math.round((c.usagePercent ?? 0) * 10) / 10;
    const arr = buckets.get(key) ?? [];
    arr.push(c);
    buckets.set(key, arr);
  }

  const sortedKeys = [...buckets.keys()].sort((a, b) => a - b);
  const out: RoutingCandidate[] = [];
  for (const k of sortedKeys) {
    const group = buckets.get(k)!;
    // Within each quota bucket, sort by activeRequests ASC (least busy first),
    // then weighted shuffle as tiebreaker for same activeRequests count.
    // Group by activeRequests level to preserve shuffle within equal levels.
    const byBusyness = new Map<number, RoutingCandidate[]>();
    for (const c of group) {
      const reqs = c.activeRequests ?? 0;
      const arr = byBusyness.get(reqs) ?? [];
      arr.push(c);
      byBusyness.set(reqs, arr);
    }
    const sortedReqs = [...byBusyness.keys()].sort((a, b) => a - b);
    for (const r of sortedReqs) {
      out.push(...weightedShuffle(byBusyness.get(r)!));
    }
  }
  return out;
}

/**
 * Fisher–Yates shuffle with weight expansion: a candidate with weight=N
 * gets N entries in the shuffle pool, then we dedupe while preserving the
 * shuffled order. Net effect: higher-weight providers are more likely to
 * appear first within their quota bucket.
 */
function weightedShuffle(group: RoutingCandidate[]): RoutingCandidate[] {
  if (group.length <= 1) return group.slice();
  // Expand by weight (cap each provider to 16 entries to bound pool size).
  const pool: RoutingCandidate[] = [];
  for (const c of group) {
    const n = Math.max(1, Math.min(16, c.pm.weight | 0 || 1));
    for (let i = 0; i < n; i++) pool.push(c);
  }
  // Fisher–Yates
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // Dedupe preserving first occurrence.
  const seen = new Set<string>();
  const out: RoutingCandidate[] = [];
  for (const c of pool) {
    if (seen.has(c.provider.id)) continue;
    seen.add(c.provider.id);
    out.push(c);
  }
  return out;
}
