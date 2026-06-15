/**
 * Fee Pipeline — API Key dimension buffer.
 *
 * Accumulates per-dimension token increments per apiKeyId, drains to DB on cron.
 * No quota pre-check (API keys inherit owner's quota).
 */

/** Per-dimension pending increments for a single API key. */
interface PendingDimensions {
  inputTokens: number;
  cachedReadTokens: number;
  outputTokens: number;
}

class ApiKeyDimensionBuffer {
  private pending = new Map<string, PendingDimensions>();

  increment(
    apiKeyId: string,
    inputTokens: number,
    cachedReadTokens: number,
    outputTokens: number,
  ): void {
    const existing = this.pending.get(apiKeyId) ?? {
      inputTokens: 0,
      cachedReadTokens: 0,
      outputTokens: 0,
    };
    existing.inputTokens += inputTokens;
    existing.cachedReadTokens += cachedReadTokens;
    existing.outputTokens += outputTokens;
    this.pending.set(apiKeyId, existing);
  }

  drain(): Map<string, PendingDimensions> {
    const snap = new Map(this.pending);
    this.pending.clear();
    return snap;
  }
}

// ── Singleton ──

const globalForApiKeyBuffer = globalThis as unknown as {
  __ucpb_api_key_dim_buffer?: ApiKeyDimensionBuffer;
};

export const apiKeyDimensionBuffer: ApiKeyDimensionBuffer =
  globalForApiKeyBuffer.__ucpb_api_key_dim_buffer ??
  new ApiKeyDimensionBuffer();
globalForApiKeyBuffer.__ucpb_api_key_dim_buffer = apiKeyDimensionBuffer;
