import { describe, expect, it } from "vitest";
import { selectCandidates } from "@/lib/routing/selectCandidate";
import type { RoutingCandidate } from "@/lib/repositories/providerModelRepo";
import type { ProviderModelRow, ProviderRow } from "@/lib/types";

function mkCandidate(
  providerId: string,
  usagePercent: number | null,
  healthy: boolean,
  weight = 1,
  activeReqs = 0,
): RoutingCandidate {
  const provider: ProviderRow = {
    id: providerId,
    name: providerId,
    baseUrlOpenai: "https://api.openai.com/v1",
    apiKeyOpenai: "k",
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
  const pm: ProviderModelRow = {
    id: providerId + "-pm",
    providerId,
    modelId: "m",
    realModelId: "rm",
    contextLengthOverride: null,
    maxTokensOverride: null,
    temperatureOverride: null,
    topPOverride: null,
    topKOverride: null,
    reasoningEffortOverride: null,
    includeReasoningInRequestOverride: null,
    weight,
    feeRateInput: 1,
    feeRateCachedInput: 0.1,
    feeRateOutput: 4,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return { pm, provider, usagePercent, healthy, activeRequests: activeReqs };
}

describe("selectCandidates", () => {
  it("tends to rank lower-usage candidates higher", () => {
    // With 50% quota weight, low usage should consistently beat high usage.
    const firsts: Record<string, number> = {};
    for (let i = 0; i < 200; i++) {
      const out = selectCandidates([
        mkCandidate("high", 90, true),
        mkCandidate("low", 5, true),
      ]);
      const first = out[0].provider.id;
      firsts[first] = (firsts[first] ?? 0) + 1;
    }
    // low-usage should win the vast majority of the time
    expect(firsts["low"]).toBeGreaterThan(150);
  });

  it("filters out unhealthy", () => {
    const out = selectCandidates([
      mkCandidate("a", 10, false),
      mkCandidate("b", 50, true),
    ]);
    expect(out.map((c) => c.provider.id)).toEqual(["b"]);
  });

  it("treats null usagePercent as 0 (highest priority)", () => {
    // null → 0% used → maximum quota score → should almost always rank first
    const firsts: Record<string, number> = {};
    for (let i = 0; i < 200; i++) {
      const out = selectCandidates([
        mkCandidate("a", 80, true),
        mkCandidate("b", null, true),
      ]);
      const first = out[0].provider.id;
      firsts[first] = (firsts[first] ?? 0) + 1;
    }
    expect(firsts["b"]).toBeGreaterThan(150);
  });

  it("randomizes order across runs due to random factor", () => {
    // With identical quota and weight, the 20% random component should
    // produce varied orderings across many runs.
    const firsts = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const out = selectCandidates([
        mkCandidate("a", 0, true),
        mkCandidate("b", 0, true),
        mkCandidate("c", 0, true),
        mkCandidate("d", 0, true),
      ]);
      firsts.add(out[0].provider.id);
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  it("higher weight tends to rank higher when quota is equal", () => {
    const firsts: Record<string, number> = {};
    for (let i = 0; i < 200; i++) {
      const out = selectCandidates([
        mkCandidate("lowW", 0, true, 1),
        mkCandidate("highW", 0, true, 8),
      ]);
      const first = out[0].provider.id;
      firsts[first] = (firsts[first] ?? 0) + 1;
    }
    // high-weight should win most of the time
    expect(firsts["highW"]).toBeGreaterThan(120);
  });
});
