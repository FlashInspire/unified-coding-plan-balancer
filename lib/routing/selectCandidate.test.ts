import { describe, expect, it, beforeEach } from "vitest";
import {
  selectCandidates,
  incrementQuotaExhaustedRetry,
  isQuotaRunningOut,
  markQuotaRunningOut,
  resetQuotaRetries,
  incrementConsecutive429,
  resetConsecutive429,
} from "@/lib/routing/selectCandidate";
import type { RoutingCandidate } from "@/lib/repositories/providerModelRepo";
import type { ProviderModelRow, ProviderRow } from "@/lib/types";

function mkCandidate(
  providerId: string,
  usagePercent: number | null,
  healthy: boolean,
  weight = 1,
  activeReqs = 0,
  quotaRunningOut = false,
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
    planStartTime: null,
    usageMode: "request",
    rollingCacheInputTokensUsed: 0,
    rollingOutputTokensUsed: 0,
    weekCacheInputTokensUsed: 0,
    weekOutputTokensUsed: 0,
    monthCacheInputTokensUsed: 0,
    monthOutputTokensUsed: 0,
    enabled: true,
    quotaRunningOut,
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
    apiStyle: "auto",
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

  it("does NOT filter out quota-exhausted providers (still eligible)", () => {
    // usagePercent = 100 means quota exhausted, but provider should still be
    // in the candidate list (just with a lower score).
    const out = selectCandidates([
      mkCandidate("exhausted", 100, true),
      mkCandidate("fresh", 5, true),
    ]);
    expect(out.length).toBe(2);
    // fresh should rank first most of the time
    const firsts: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      const r = selectCandidates([
        mkCandidate("exhausted", 100, true),
        mkCandidate("fresh", 5, true),
      ]);
      const first = r[0].provider.id;
      firsts[first] = (firsts[first] ?? 0) + 1;
    }
    expect(firsts["fresh"]).toBeGreaterThan(80);
  });

  it("filters out providers marked as quotaRunningOut (DB field)", () => {
    const out = selectCandidates([
      mkCandidate("runningOut", 100, true, 1, 0, true),
      mkCandidate("normal", 50, true),
    ]);
    expect(out.map((c) => c.provider.id)).toEqual(["normal"]);
  });

  it("filters out providers marked as quotaRunningOut (in-memory)", () => {
    markQuotaRunningOut("mem-running-out");
    const out = selectCandidates([
      mkCandidate("mem-running-out", 100, true),
      mkCandidate("normal", 50, true),
    ]);
    expect(out.map((c) => c.provider.id)).toEqual(["normal"]);
    resetQuotaRetries("mem-running-out");
  });
});

describe("quota retry tracking", () => {
  beforeEach(() => {
    // Clean up in-memory state between tests
    resetQuotaRetries("test-provider");
  });

  it("incrementQuotaExhaustedRetry increments counter", () => {
    expect(incrementQuotaExhaustedRetry("test-provider")).toBe(1);
    expect(incrementQuotaExhaustedRetry("test-provider")).toBe(2);
    expect(incrementQuotaExhaustedRetry("test-provider")).toBe(3);
  });

  it("markQuotaRunningOut adds to in-memory set", () => {
    expect(isQuotaRunningOut("test-provider")).toBe(false);
    markQuotaRunningOut("test-provider");
    expect(isQuotaRunningOut("test-provider")).toBe(true);
  });

  it("resetQuotaRetries clears counter and running-out status", () => {
    incrementQuotaExhaustedRetry("test-provider");
    incrementQuotaExhaustedRetry("test-provider");
    markQuotaRunningOut("test-provider");
    expect(isQuotaRunningOut("test-provider")).toBe(true);

    resetQuotaRetries("test-provider");
    expect(isQuotaRunningOut("test-provider")).toBe(false);
    // Counter is also reset, so next increment starts at 1
    expect(incrementQuotaExhaustedRetry("test-provider")).toBe(1);
  });

  it("provider with usagePercent below threshold has retry counter reset", () => {
    // Simulate a provider that was exhausted and had retries
    incrementQuotaExhaustedRetry("test-provider");
    incrementQuotaExhaustedRetry("test-provider");

    // Now select with usagePercent below threshold — should reset counter
    selectCandidates([mkCandidate("test-provider", 50, true)]);

    // Counter should be reset, so next increment starts at 1
    expect(incrementQuotaExhaustedRetry("test-provider")).toBe(1);
  });
});

describe("consecutive 429 tracking", () => {
  beforeEach(() => {
    resetConsecutive429("test-provider");
    resetQuotaRetries("test-provider");
  });

  it("incrementConsecutive429 increments counter but does not mark Running out below threshold", () => {
    expect(incrementConsecutive429("test-provider")).toBe(false);
    expect(incrementConsecutive429("test-provider")).toBe(false);
    // 2 consecutive 429s — still below default threshold of 3
    expect(isQuotaRunningOut("test-provider")).toBe(false);
  });

  it("incrementConsecutive429 marks Running out when threshold is reached", () => {
    incrementConsecutive429("test-provider"); // 1
    incrementConsecutive429("test-provider"); // 2
    const marked = incrementConsecutive429("test-provider"); // 3 → threshold
    expect(marked).toBe(true);
    expect(isQuotaRunningOut("test-provider")).toBe(true);
  });

  it("resetConsecutive429 clears the counter", () => {
    incrementConsecutive429("test-provider");
    incrementConsecutive429("test-provider");
    resetConsecutive429("test-provider");
    // After reset, next increment starts at 1
    expect(incrementConsecutive429("test-provider")).toBe(false);
  });

  it("provider marked Running out by 429s is excluded from routing", () => {
    // Simulate 3 consecutive 429s
    incrementConsecutive429("test-provider");
    incrementConsecutive429("test-provider");
    incrementConsecutive429("test-provider");
    expect(isQuotaRunningOut("test-provider")).toBe(true);

    const out = selectCandidates([
      mkCandidate("test-provider", 50, true),
      mkCandidate("normal", 50, true),
    ]);
    expect(out.map((c) => c.provider.id)).toEqual(["normal"]);
  });
});
