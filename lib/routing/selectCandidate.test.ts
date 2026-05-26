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
  it("sorts by ascending usagePercent", () => {
    const out = selectCandidates([
      mkCandidate("a", 80, true),
      mkCandidate("b", 10, true),
      mkCandidate("c", 50, true),
    ]);
    expect(out.map((c) => c.provider.id)).toEqual(["b", "c", "a"]);
  });

  it("filters out unhealthy", () => {
    const out = selectCandidates([
      mkCandidate("a", 10, false),
      mkCandidate("b", 50, true),
    ]);
    expect(out.map((c) => c.provider.id)).toEqual(["b"]);
  });

  it("treats null usagePercent as 0 (highest priority)", () => {
    const out = selectCandidates([
      mkCandidate("a", 5, true),
      mkCandidate("b", null, true),
    ]);
    expect(out[0].provider.id).toBe("b");
  });

  it("randomizes order within equal-quota groups across runs", () => {
    // 4 candidates all with usagePercent=0. Over many runs the first
    // position should not always be the same provider.
    const firsts = new Set<string>();
    for (let i = 0; i < 50; i++) {
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

  it("quantizes near-equal usage into the same bucket", () => {
    // 10.04 and 10.0 both round to 10.0 — should be in the same bucket
    // and may appear in either order.
    const out = selectCandidates([
      mkCandidate("a", 10.04, true),
      mkCandidate("b", 10.0, true),
      mkCandidate("c", 50, true),
    ]);
    expect(out.at(-1)?.provider.id).toBe("c");
    expect(new Set(out.slice(0, 2).map((c) => c.provider.id))).toEqual(
      new Set(["a", "b"]),
    );
  });
});
