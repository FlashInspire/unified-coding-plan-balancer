import type { RoutingCandidate } from "@/lib/repositories/providerModelRepo";
import type { LoadBalanceMode } from "@/lib/repositories/systemSettingRepo";
import { env } from "@/lib/env";

// Re-export so callers can import from here without touching the repo module.
export type { LoadBalanceMode };

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
}

// ---------------------------------------------------------------------------
// Eligibility filter — shared across all modes
// ---------------------------------------------------------------------------

/**
 * Filter out unhealthy, transiently-failing, and "Running out" candidates.
 * Quota-exhausted providers (usagePercent >= threshold) are NOT filtered
 * out — they are still eligible but may receive a lower score depending
 * on the active mode. Only after MAX_QUOTA_RETRIES consecutive selections
 * of an exhausted provider is it marked as "Running out" and excluded.
 */
function filterEligible(candidates: RoutingCandidate[]): RoutingCandidate[] {
  return candidates.filter((c) => {
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
}

// ---------------------------------------------------------------------------
// Mode: weighted (default) — composite score
// ---------------------------------------------------------------------------

// Score weights — must sum to 1.0
const W_QUOTA = 0.5;
const W_WEIGHT = 0.3;
const W_RANDOM = 0.2;

/**
 * Composite weighted scoring (original algorithm):
 * - Quota score (50%): inverse of usagePercent — lower usage = higher score.
 * - Weight score (30%): normalized provider-model weight — higher = better.
 * - Random score (20%): uniform random to add jitter.
 * Tiebreaker: fewer active requests first.
 */
function orderWeighted(eligible: RoutingCandidate[]): RoutingCandidate[] {
  const maxWeight = Math.max(1, ...eligible.map((c) => c.pm.weight | 0 || 1));

  const scored = eligible.map((c) => {
    const quotaScore = 1 - Math.min(1, (c.usagePercent ?? 0) / 100);
    const weightScore = (c.pm.weight | 0 || 1) / maxWeight;
    const randomScore = Math.random();

    const composite =
      W_QUOTA * quotaScore + W_WEIGHT * weightScore + W_RANDOM * randomScore;

    return { candidate: c, composite };
  });

  scored.sort((a, b) => {
    if (b.composite !== a.composite) return b.composite - a.composite;
    return (
      (a.candidate.activeRequests ?? 0) - (b.candidate.activeRequests ?? 0)
    );
  });

  return scored.map((s) => s.candidate);
}

// ---------------------------------------------------------------------------
// Mode: round-robin — deterministic cycling via per-key cursor
// ---------------------------------------------------------------------------

/**
 * In-memory round-robin cursor map.
 * Key is an opaque string (typically modelId), value is the current index.
 * Resets on process restart (acceptable for single-container deployments).
 */
const rrCursors = new Map<string, number>();

/**
 * Round-robin ordering: candidates are sorted by provider.id for stable
 * ordering, then rotated so the candidate at `cursor % n` is first.
 * The cursor is incremented after each call.
 */
function orderRoundRobin(
  eligible: RoutingCandidate[],
  cursorKey: string,
): RoutingCandidate[] {
  // Sort by provider.id for deterministic initial ordering
  const sorted = [...eligible].sort((a, b) =>
    a.provider.id.localeCompare(b.provider.id),
  );

  const n = sorted.length;
  const idx = rrCursors.get(cursorKey) ?? 0;
  const offset = idx % n;
  rrCursors.set(cursorKey, idx + 1);

  // Rotate: slice from offset, then prepend the tail
  return [...sorted.slice(offset), ...sorted.slice(0, offset)];
}

// ---------------------------------------------------------------------------
// Mode: strict-weight — pure weighted random sampling without replacement
// ---------------------------------------------------------------------------

/**
 * Weighted random ordering using the Efraimidis–Spirakis key method:
 * For each candidate assign a key = pow(random, 1/weight) and sort descending.
 * This gives probability of being first proportional to weight.
 * Quota usage is completely ignored.
 */
function orderStrictWeight(eligible: RoutingCandidate[]): RoutingCandidate[] {
  const scored = eligible.map((c) => {
    const w = c.pm.weight | 0 || 1;
    const key = Math.pow(Math.random(), 1 / w);
    return { candidate: c, key };
  });

  scored.sort((a, b) => b.key - a.key);
  return scored.map((s) => s.candidate);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Options for candidate selection.
 */
export interface SelectCandidatesOpts {
  /** Routing mode. Defaults to the system setting (falling back to "weighted"). */
  mode?: LoadBalanceMode;
  /** Round-robin cursor key (typically modelId). Only used when mode === "round-robin". */
  cursorKey?: string;
}

/**
 * Select and order candidates for routing.
 *
 * 1. Drop unhealthy, transiently-failing, and "Running out" candidates.
 * 2. Apply the active mode's ordering.
 * 3. Return the ordered array (may be empty if no candidates are eligible).
 */
export function selectCandidates(
  candidates: RoutingCandidate[],
  opts?: SelectCandidatesOpts,
): RoutingCandidate[] {
  const eligible = filterEligible(candidates);
  if (eligible.length <= 1) return eligible.slice();

  const mode = opts?.mode ?? "weighted";

  switch (mode) {
    case "round-robin":
      return orderRoundRobin(eligible, opts?.cursorKey ?? "default");
    case "strict-weight":
      return orderStrictWeight(eligible);
    case "weighted":
    default:
      return orderWeighted(eligible);
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Reset all round-robin cursors. Intended for test teardown only. */
export function __resetRoundRobinCursorsForTests(): void {
  rrCursors.clear();
}
