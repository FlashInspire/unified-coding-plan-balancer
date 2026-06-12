/**
 * Domain types used across lib/* and api routes.
 *
 * We intentionally mirror the Prisma rows as plain TS interfaces, decoupling
 * the rest of the codebase from Prisma's awkward v7 generated type names
 * (which renames row types like `ModelModel`, `ProviderModel`, etc.).
 */

export type ApiMode = "openai" | "anthropic";
export type ReasoningEffort = "low" | "medium" | "high";

export interface ModelRow {
  id: string;
  displayName: string;
  contextLength: number;
  maxTokens: number;
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  minP: number | null;
  frequencyPenalty: number | null;
  presencePenalty: number | null;
  repetitionPenalty: number | null;
  reasoningEffort: string | null;
  includeReasoningInRequest: boolean;
  vision: boolean;
  enableThinking: boolean | null;
  thinkingBudget: number | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderRow {
  id: string;
  name: string;
  baseUrlOpenai: string | null;
  apiKeyOpenai: string | null;
  baseUrlAnthropic: string | null;
  apiKeyAnthropic: string | null;
  headersTemplate: string;
  rollingQuota: number | null;
  weekQuota: number | null;
  monthQuota: number | null;
  rollingQuotaUsed: number;
  weekQuotaUsed: number;
  monthQuotaUsed: number;
  rollingQuotaResetAt: Date | null;
  weekQuotaResetAt: Date | null;
  monthQuotaResetAt: Date | null;
  planStartTime: Date | null;
  usageMode: string;
  rollingCacheInputTokensUsed: number;
  rollingOutputTokensUsed: number;
  weekCacheInputTokensUsed: number;
  weekOutputTokensUsed: number;
  monthCacheInputTokensUsed: number;
  monthOutputTokensUsed: number;
  enabled: boolean;
  quotaRunningOut: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ProviderApiStyle = "auto" | "openai" | "anthropic";

export interface ProviderModelRow {
  id: string;
  modelId: string;
  providerId: string;
  realModelId: string | null;
  contextLengthOverride: number | null;
  maxTokensOverride: number | null;
  temperatureOverride: number | null;
  topPOverride: number | null;
  topKOverride: number | null;
  reasoningEffortOverride: string | null;
  includeReasoningInRequestOverride: boolean | null;
  weight: number;
  apiStyle: string; // "auto" | "openai" | "anthropic" — typed as string to match Prisma/SQLite
  feeRateInput: number;
  feeRateCachedInput: number;
  feeRateOutput: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKeyRow {
  id: string;
  keyHash: string;
  name: string;
  enabled: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
  rollingQuota: number | null;
  weekQuota: number | null;
  monthQuota: number | null;
  tokensUsed: number;
  rollingQuotaResetAt: Date | null;
  weekQuotaResetAt: Date | null;
  monthQuotaResetAt: Date | null;
}

export interface AdminUserRow {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: Date;
}

export interface ProviderQuotaSnapshotRow {
  providerId: string;
  usagePercent: number | null;
  fetchedAt: Date;
  healthy: boolean;
}

/** Resolved view of a provider with its decoded headers (apiKey still raw). */
export interface ResolvedProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  headers: Record<string, string>;
}

/** Final, fully resolved model params after layering user > pm > model. */
export interface ResolvedParams {
  contextLength: number;
  maxTokens: number;
  realModelId: string;
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  reasoningEffort: ReasoningEffort | null;
  includeReasoning: boolean;
}

/** Subset of values a client request body may override. */
export interface UserOverrides {
  temperature?: number | null;
  topP?: number | null;
  topK?: number | null;
  maxTokens?: number | null;
  reasoningEffort?: ReasoningEffort | null;
  includeReasoning?: boolean | null;
}
