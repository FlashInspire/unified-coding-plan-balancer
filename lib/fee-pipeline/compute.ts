/**
 * Fee Pipeline — pure fee calculation functions.
 *
 * No side effects; fully unit-testable.
 *
 * Rules:
 * - Provider (token mode): fee = input*feeRateInput + (cachedRead+cacheWrite)*feeRateCachedInput + output*feeRateOutput
 * - Provider (request mode): fee = feeRateInput (flat per request)
 * - User: fee = input*multiplierInput + (cachedRead+cacheWrite)*multiplierCachedRead + output*multiplierOutput
 * - ApiKey: raw token counts (no multipliers)
 */

import type { FeePipelineInput, FeePipelineResult } from "./types";

// ---------------------------------------------------------------------------
// Provider fee (token mode)
// ---------------------------------------------------------------------------

export function computeProviderFee(input: FeePipelineInput): number {
  if (input.providerUsageMode === "request") {
    return input.feeRateInput; // flat per-request cost
  }
  return (
    input.inputTokens * input.feeRateInput +
    (input.cachedReadTokens + input.cacheWriteTokens) *
      input.feeRateCachedInput +
    input.outputTokens * input.feeRateOutput
  );
}

// ---------------------------------------------------------------------------
// Provider per-dimension fee breakdown (for DB counters)
// ---------------------------------------------------------------------------

export interface ProviderDimensionFee {
  inputCost: number;
  cachedCost: number;
  outputCost: number;
}

export function computeProviderDimensionFee(
  input: FeePipelineInput,
): ProviderDimensionFee {
  if (input.providerUsageMode === "request") {
    return { inputCost: input.feeRateInput, cachedCost: 0, outputCost: 0 };
  }
  return {
    inputCost: input.inputTokens * input.feeRateInput,
    cachedCost:
      (input.cachedReadTokens + input.cacheWriteTokens) *
      input.feeRateCachedInput,
    outputCost: input.outputTokens * input.feeRateOutput,
  };
}

// ---------------------------------------------------------------------------
// User fee (always token-based, with multipliers)
// ---------------------------------------------------------------------------

export function computeUserFee(input: FeePipelineInput): number {
  return (
    input.inputTokens * input.userMultiplierInput +
    (input.cachedReadTokens + input.cacheWriteTokens) *
      input.userMultiplierCachedRead +
    input.outputTokens * input.userMultiplierOutput
  );
}

// ---------------------------------------------------------------------------
// API key raw token totals (no multipliers)
// ---------------------------------------------------------------------------

export function computeApiKeyTokens(input: FeePipelineInput): number {
  return (
    input.inputTokens +
    input.cachedReadTokens +
    input.cacheWriteTokens +
    input.outputTokens
  );
}

// ---------------------------------------------------------------------------
// Full pipeline computation
// ---------------------------------------------------------------------------

export function computeAll(input: FeePipelineInput): FeePipelineResult {
  return {
    providerFee: computeProviderFee(input),
    userFee: computeUserFee(input),
    apiKeyTokens: computeApiKeyTokens(input),
  };
}
