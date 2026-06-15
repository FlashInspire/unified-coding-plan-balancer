/**
 * In-memory buffer for user-level token usage.
 *
 * Tokens are accumulated per-userId during dispatch and flushed to the
 * database periodically by the cron endpoint.  This avoids a Prisma
 * round-trip on every successful request.
 *
 * Quota is tracked at the user level (AdminUser), not per API key.
 */

/** Quota info for a single user, cached in-memory for fast checks. */
export interface UserQuotaInfo {
  rollingQuota: number | null;
  weekQuota: number | null;
  monthQuota: number | null;
  tokensUsed: number; // current DB value
}

class UserTokenBuffer {
  /** pending tokens not yet flushed to DB, keyed by userId */
  private pending = new Map<string, number>();

  /**
   * Cache of userId → quota info + timestamp (epoch ms).
   * Keeps the DB value so we can do fast quota checks without hitting
   * Prisma on every request.  The cron flusher refreshes this after
   * every DB flush.
   */
  private quotaCache = new Map<string, { info: UserQuotaInfo; ts: number }>();

  /** Quota cache TTL (ms). */
  private static CACHE_TTL_MS = 30_000;

  // ── Pending buffer ─────────────────────────────────────────────

  /** Accumulate token usage for a user (called on successful dispatch). */
  increment(userId: string, tokens: number): void {
    if (tokens <= 0) return;
    this.pending.set(userId, (this.pending.get(userId) ?? 0) + tokens);
  }

  /** Get the current pending (unflushed) token count for a user. */
  getPending(userId: string): number {
    return this.pending.get(userId) ?? 0;
  }

  /** Drain all pending entries.  Returns a snapshot then clears internal map. */
  drain(): Map<string, number> {
    const snap = new Map(this.pending);
    this.pending.clear();
    return snap;
  }

  // ── Quota cache ────────────────────────────────────────────────

  /** Cache quota info for a user (called by reset-scheduler or flusher). */
  setQuotaCache(userId: string, info: UserQuotaInfo): void {
    this.quotaCache.set(userId, { info, ts: Date.now() });
  }

  /** Clear cached quota for a user (called after reset). */
  clearQuotaCache(userId: string): void {
    this.quotaCache.delete(userId);
  }

  /** Clear all cached quotas. */
  clearAllQuotaCache(): void {
    this.quotaCache.clear();
  }

  /**
   * Check whether adding `tokens` to this user would exceed any active quota.
   *
   * Returns `true` if the request should be **blocked** (quota exceeded),
   * `false` if it may proceed.
   *
   * If the user has no cached quota info the check is skipped (allow) — the
   * cron job will populate the cache on the next cycle.
   */
  isQuotaExceeded(userId: string, tokens: number): boolean {
    const cached = this.quotaCache.get(userId);
    if (!cached) return false; // no info → allow

    const now = Date.now();
    // Expired cache → allow (will be refreshed soon)
    if (now - cached.ts > UserTokenBuffer.CACHE_TTL_MS) return false;

    const { info } = cached;
    const totalUsed = info.tokensUsed + (this.pending.get(userId) ?? 0) + tokens;

    if (info.rollingQuota != null && info.rollingQuota > 0) {
      if (totalUsed >= info.rollingQuota) return true;
    }
    if (info.weekQuota != null && info.weekQuota > 0) {
      if (totalUsed >= info.weekQuota) return true;
    }
    if (info.monthQuota != null && info.monthQuota > 0) {
      if (totalUsed >= info.monthQuota) return true;
    }

    return false;
  }

  /** Snapshot of all cached quotas (for debugging / admin). */
  snapshot(): Map<string, UserQuotaInfo> {
    const out = new Map<string, UserQuotaInfo>();
    for (const [k, v] of this.quotaCache) {
      out.set(k, v.info);
    }
    return out;
  }
}

// ── Singleton (globalThis guard against hot-reload duplicates) ──

const globalForUserBuffer = globalThis as unknown as {
  __ucpb_user_token_buffer?: UserTokenBuffer;
};

export const userTokenBuffer: UserTokenBuffer =
  globalForUserBuffer.__ucpb_user_token_buffer ?? new UserTokenBuffer();
globalForUserBuffer.__ucpb_user_token_buffer = userTokenBuffer;
