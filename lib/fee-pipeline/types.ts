/**
 * Fee Pipeline — types.
 *
 * Canonical 4-dimension token model used across the entire system:
 *   inputTokens / cachedReadTokens / cacheWriteTokens / outputTokens
 *
 * All accounting (Provider, User, ApiKey) funnels through a single
 * `recordUsage()` call with one of these inputs.
 */

// ---------------------------------------------------------------------------
// Pipeline input
// ---------------------------------------------------------------------------

export interface FeePipelineInput {
  // Raw normalized token counts (4 dimensions)
  inputTokens: number;
  cachedReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;

  // Context for routing the accounting
  providerId: string;
  apiKeyId: string;
  userId: string | null; // null for admin-owned keys
  modelId: string;
  pmId: string;

  // Fee rates from ProviderModel
  feeRateInput: number; // default 1.0
  feeRateCachedInput: number; // default 0.1
  feeRateOutput: number; // default 4.0

  // Provider usage mode
  providerUsageMode: "request" | "token";

  // User quota multipliers (from AdminUser)
  userMultiplierInput: number;
  userMultiplierCachedRead: number;
  userMultiplierOutput: number;
}

// ---------------------------------------------------------------------------
// Pipeline result
// ---------------------------------------------------------------------------

export interface FeePipelineResult {
  /** Weighted fee charged to provider quota (token mode). */
  providerFee: number;
  /** Weighted fee charged to user quota (always token-based). */
  userFee: number;
  /** Raw total tokens for API key accounting. */
  apiKeyTokens: number;
}

// ---------------------------------------------------------------------------
// Per-dimension increments (used for buffer drain → DB flush)
// ---------------------------------------------------------------------------

export interface DimensionIncrements {
  inputTokens: number;
  cachedReadTokens: number;
  outputTokens: number;
}
