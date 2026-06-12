/**
 * In-memory buffer for API key token usage.
 *
 * Tokens are accumulated per-keyId during dispatch and flushed to the
 * database periodically by the cron endpoint.  This avoids a Prisma
 * round-trip on every successful request.
 */

/** Quota info for a single key, cached in-memory for fast checks. */
export interface KeyQuotaInfo {
  rollingQuota: number | null;
  weekQuota: number | null;
  monthQuota: number | null;
  tokensUsed: number; // current DB value
}

class KeyTokenBuffer {
  /** pending tokens not yet flushed to DB */
  private pending = new Map<string, number>();

  /**
   * Cache of keyId → quota info + timestamp (epoch ms).
   * Keeps the DB value so we can do fast quota checks without hitting
   * Prisma on every request.  The cron flusher refreshes this after
   * every DB flush.
   */
  private quotaCache = new Map<string, { info: KeyQuotaInfo; ts: number }>();

  /** Quota cache TTL (ms). */
  private static CACHE_TTL_MS = 30_000;

  // ── Pending buffer ─────────────────────────────────────────────

  /** Accumulate token usage for a key (called on successful dispatch). */
  increment(keyId: string, tokens: number): void {
    if (tokens <= 0) return;
    this.pending.set(keyId, (this.pending.get(keyId) ?? 0) + tokens);
  }

  /** Get the current pending (unflushed) token count for a key. */
  getPending(keyId: string): number {
    return this.pending.get(keyId) ?? 0;
  }

  /** Drain all pending entries.  Returns a snapshot then clears internal map. */
  drain(): Map<string, number> {
    const snap = new Map(this.pending);
    this.pending.clear();
    return snap;
  }

  // ── Quota cache ────────────────────────────────────────────────

  /** Cache quota info for a key (called by reset-scheduler or flusher). */
  setQuotaCache(keyId: string, info: KeyQuotaInfo): void {
    this.quotaCache.set(keyId, { info, ts: Date.now() });
  }

  /** Clear cached quota for a key (called after reset). */
  clearQuotaCache(keyId: string): void {
    this.quotaCache.delete(keyId);
  }

  /** Clear all cached quotas. */
  clearAllQuotaCache(): void {
    this.quotaCache.clear();
  }

  /**
   * Check whether adding `tokens` to this key would exceed any active quota.
   *
   * Returns `true` if the request should be **blocked** (quota exceeded),
   * `false` if it may proceed.
   *
   * If the key has no cached quota info the check is skipped (allow) — the
   * cron job will populate the cache on the next cycle.
   */
  isQuotaExceeded(keyId: string, tokens: number): boolean {
    const cached = this.quotaCache.get(keyId);
    if (!cached) return false; // no info → allow

    const now = Date.now();
    // Expired cache → allow (will be refreshed soon)
    if (now - cached.ts > KeyTokenBuffer.CACHE_TTL_MS) return false;

    const { info } = cached;
    const totalUsed = info.tokensUsed + (this.pending.get(keyId) ?? 0) + tokens;

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
  snapshot(): Map<string, KeyQuotaInfo> {
    const out = new Map<string, KeyQuotaInfo>();
    for (const [k, v] of this.quotaCache) {
      out.set(k, v.info);
    }
    return out;
  }
}

// ── Singleton (globalThis guard against hot-reload duplicates) ──

const globalForKeyBuffer = globalThis as unknown as {
  __ucpb_key_token_buffer?: KeyTokenBuffer;
};

export const keyTokenBuffer: KeyTokenBuffer =
  globalForKeyBuffer.__ucpb_key_token_buffer ?? new KeyTokenBuffer();
globalForKeyBuffer.__ucpb_key_token_buffer = keyTokenBuffer;
