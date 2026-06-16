/**
 * Fee Pipeline — User dimension buffer.
 *
 * Replaces the old `lib/quota/keyTokenBuffer.ts`.
 * Accumulates per-dimension token increments per userId, drains to DB on cron.
 * Also provides quota pre-check with multipliers.
 */

/** Per-dimension pending increments for a single user. */
interface PendingDimensions {
  inputTokens: number;
  cachedReadTokens: number;
  outputTokens: number;
}

/** Cached quota info for fast pre-checks. */
export interface UserQuotaInfo {
  rollingQuota: bigint | null;
  weekQuota: bigint | null;
  monthQuota: bigint | null;
  // Current DB values (total weighted fee used)
  rollingQuotaUsed: number;
  weekQuotaUsed: number;
  monthQuotaUsed: number;
  // Multipliers (still needed for incoming fee estimation)
  quotaMultiplierInput: number;
  quotaMultiplierCachedRead: number;
  quotaMultiplierOutput: number;
}

class UserDimensionBuffer {
  private pending = new Map<string, PendingDimensions>();
  private quotaCache = new Map<string, { info: UserQuotaInfo; ts: number }>();
  private static CACHE_TTL_MS = 30_000;

  // ── Pending buffer ─────────────────────────────────────────────

  increment(
    userId: string,
    inputTokens: number,
    cachedReadTokens: number,
    outputTokens: number,
  ): void {
    const existing = this.pending.get(userId) ?? {
      inputTokens: 0,
      cachedReadTokens: 0,
      outputTokens: 0,
    };
    existing.inputTokens += inputTokens;
    existing.cachedReadTokens += cachedReadTokens;
    existing.outputTokens += outputTokens;
    this.pending.set(userId, existing);
  }

  getPending(userId: string): PendingDimensions {
    return (
      this.pending.get(userId) ?? {
        inputTokens: 0,
        cachedReadTokens: 0,
        outputTokens: 0,
      }
    );
  }

  drain(): Map<string, PendingDimensions> {
    const snap = new Map(this.pending);
    this.pending.clear();
    return snap;
  }

  // ── Quota cache ────────────────────────────────────────────────

  setQuotaCache(userId: string, info: UserQuotaInfo): void {
    this.quotaCache.set(userId, { info, ts: Date.now() });
  }

  clearQuotaCache(userId: string): void {
    this.quotaCache.delete(userId);
  }

  clearAllQuotaCache(): void {
    this.quotaCache.clear();
  }

  /**
   * Check whether adding tokens would exceed any active quota.
   * Returns true if request should be BLOCKED.
   */
  isQuotaExceeded(
    userId: string,
    inputTokens: number,
    cachedReadTokens: number,
    outputTokens: number,
  ): boolean {
    const cached = this.quotaCache.get(userId);
    if (!cached) return false;

    const now = Date.now();
    if (now - cached.ts > UserDimensionBuffer.CACHE_TTL_MS) return false;

    const { info } = cached;
    const pending = this.getPending(userId);

    // Weighted fee for the incoming request
    const incomingFee =
      inputTokens * info.quotaMultiplierInput +
      cachedReadTokens * info.quotaMultiplierCachedRead +
      outputTokens * info.quotaMultiplierOutput;

    // Weighted fee for pending (already buffered but not flushed)
    const pendingFee =
      pending.inputTokens * info.quotaMultiplierInput +
      pending.cachedReadTokens * info.quotaMultiplierCachedRead +
      pending.outputTokens * info.quotaMultiplierOutput;

    // Check each period's total against quota
    // Rolling
    if (info.rollingQuota != null && info.rollingQuota > 0n) {
      if (
        info.rollingQuotaUsed + pendingFee + incomingFee >=
        Number(info.rollingQuota)
      )
        return true;
    }
    // Week
    if (info.weekQuota != null && info.weekQuota > 0n) {
      if (
        info.weekQuotaUsed + pendingFee + incomingFee >=
        Number(info.weekQuota)
      )
        return true;
    }
    // Month
    if (info.monthQuota != null && info.monthQuota > 0n) {
      if (
        info.monthQuotaUsed + pendingFee + incomingFee >=
        Number(info.monthQuota)
      )
        return true;
    }

    return false;
  }

  /**
   * Get quota multipliers for a user from the cache.
   * Returns defaults if the user is not cached.
   */
  getMultipliers(userId: string): {
    input: number;
    cachedRead: number;
    output: number;
  } {
    const cached = this.quotaCache.get(userId);
    if (!cached) return { input: 1.0, cachedRead: 0.1, output: 4.0 };
    return {
      input: cached.info.quotaMultiplierInput,
      cachedRead: cached.info.quotaMultiplierCachedRead,
      output: cached.info.quotaMultiplierOutput,
    };
  }

  snapshot(): Map<string, UserQuotaInfo> {
    const out = new Map<string, UserQuotaInfo>();
    for (const [k, v] of this.quotaCache) {
      out.set(k, v.info);
    }
    return out;
  }
}

// ── Singleton ──

const globalForUserBuffer = globalThis as unknown as {
  __ucpb_user_dim_buffer?: UserDimensionBuffer;
};

export const userDimensionBuffer: UserDimensionBuffer =
  globalForUserBuffer.__ucpb_user_dim_buffer ?? new UserDimensionBuffer();
globalForUserBuffer.__ucpb_user_dim_buffer = userDimensionBuffer;
