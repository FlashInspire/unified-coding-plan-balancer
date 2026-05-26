import { describe, expect, it } from "vitest";
import { resolveModelParams } from "@/lib/routing/resolveParams";
import type { ModelRow, ProviderModelRow, ProviderRow } from "@/lib/types";

const baseModel: ModelRow = {
  id: "gpt-4o",
  displayName: "GPT-4o",
  contextLength: 128_000,
  maxTokens: 4096,
  temperature: 0.7,
  topP: 1,
  topK: null,
  reasoningEffort: null,
  includeReasoningInRequest: false,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const baseProvider: ProviderRow = {
  id: "openai",
  name: "OpenAI",
  baseUrlOpenai: "https://api.openai.com/v1",
  apiKeyOpenai: "sk-XXXXX",
  baseUrlAnthropic: null,
  apiKeyAnthropic: null,
  headersTemplate: "{}",
  rollingQuota: null,
  weekQuota: null,
  monthQuota: null,
  rollingQuotaUsed: 0,
  weekQuotaUsed: 0,
  monthQuotaUsed: 0,
  rollingQuotaResetAt: null,
  weekQuotaResetAt: null,
  monthQuotaResetAt: null,
  rollingHourOffset: 0,
  usageMode: "request",
  rollingCacheInputTokensUsed: 0,
  rollingOutputTokensUsed: 0,
  weekCacheInputTokensUsed: 0,
  weekOutputTokensUsed: 0,
  monthCacheInputTokensUsed: 0,
  monthOutputTokensUsed: 0,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const basePm: ProviderModelRow = {
  id: "pm1",
  providerId: "openai",
  modelId: "gpt-4o",
  realModelId: "gpt-4o-2024-11-20",
  contextLengthOverride: null,
  maxTokensOverride: null,
  temperatureOverride: null,
  topPOverride: null,
  topKOverride: null,
  reasoningEffortOverride: null,
  includeReasoningInRequestOverride: null,
  weight: 1,
  feeRateInput: 1,
  feeRateCachedInput: 0.1,
  feeRateOutput: 4,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("resolveModelParams", () => {
  it("uses model defaults when no override or user value", () => {
    const r = resolveModelParams(baseModel, baseProvider, basePm, {});
    expect(r.temperature).toBe(0.7);
    expect(r.maxTokens).toBe(4096);
    expect(r.realModelId).toBe("gpt-4o-2024-11-20");
  });

  it("provider-model override beats model default", () => {
    const r = resolveModelParams(
      baseModel,
      baseProvider,
      { ...basePm, temperatureOverride: 0.3 },
      {},
    );
    expect(r.temperature).toBe(0.3);
  });

  it("user value beats override", () => {
    const r = resolveModelParams(
      baseModel,
      baseProvider,
      { ...basePm, temperatureOverride: 0.3 },
      { temperature: 0.9 },
    );
    expect(r.temperature).toBe(0.9);
  });

  it("maxTokens user value is capped by override", () => {
    const r = resolveModelParams(
      baseModel,
      baseProvider,
      { ...basePm, maxTokensOverride: 2000 },
      { maxTokens: 5000 },
    );
    expect(r.maxTokens).toBe(2000);
  });

  it("maxTokens uses model default cap when override missing", () => {
    const r = resolveModelParams(baseModel, baseProvider, basePm, {
      maxTokens: 10_000,
    });
    expect(r.maxTokens).toBe(4096);
  });
});
