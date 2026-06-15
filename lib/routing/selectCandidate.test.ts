import { describe, expect, it, beforeEach } from "vitest";
import {
  selectCandidates,
  incrementQuotaExhaustedRetry,
  isQuotaRunningOut,
  markQuotaRunningOut,
  resetQuotaRetries,
  __resetRoundRobinCursorsForTests,
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

// ---------------------------------------------------------------------------
// round-robin mode
// ---------------------------------------------------------------------------

describe("selectCandidates - round-robin", () => {
  beforeEach(() => {
    __resetRoundRobinCursorsForTests();
  });

  it("cycles through candidates in stable id order", () => {
    const candidates = [
      mkCandidate("c-provider", 10, true),
      mkCandidate("a-provider", 10, true),
      mkCandidate("b-provider", 10, true),
    ];
    const opts = { mode: "round-robin" as const, cursorKey: "m" };

    // Sorted by id: a, b, c — then rotation: 0→a, 1→b, 2→c, 3→a, ...
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const out = selectCandidates(candidates, opts);
      ids.push(out[0].provider.id);
    }
    // Should cycle: a, b, c, a, b, c
    expect(ids).toEqual([
      "a-provider",
      "b-provider",
      "c-provider",
      "a-provider",
      "b-provider",
      "c-provider",
    ]);
  });

  it("maintains independent cursors per cursorKey", () => {
    const candidates = [mkCandidate("x", 10, true), mkCandidate("y", 10, true)];

    const out1 = selectCandidates(candidates, {
      mode: "round-robin",
      cursorKey: "modelA",
    });
    const out2 = selectCandidates(candidates, {
      mode: "round-robin",
      cursorKey: "modelB",
    });

    // Both cursors start at 0, so both should pick the same first candidate
    // (sorted by id: x < y → x first)
    expect(out1[0].provider.id).toBe("x");
    expect(out2[0].provider.id).toBe("x");

    // Second call for modelA should pick y, while modelB still picks x next time
    const out1b = selectCandidates(candidates, {
      mode: "round-robin",
      cursorKey: "modelA",
    });
    expect(out1b[0].provider.id).toBe("y");
  });

  it("filters out unhealthy and running-out candidates", () => {
    markQuotaRunningOut("bad");
    const candidates = [
      mkCandidate("bad", 10, true),
      mkCandidate("good", 50, true),
    ];
    const out = selectCandidates(candidates, {
      mode: "round-robin",
      cursorKey: "m",
    });
    expect(out.map((c) => c.provider.id)).toEqual(["good"]);
    resetQuotaRetries("bad");
  });

  it("returns single candidate as-is", () => {
    const candidates = [mkCandidate("only", 10, true)];
    const out = selectCandidates(candidates, {
      mode: "round-robin",
      cursorKey: "m",
    });
    expect(out.map((c) => c.provider.id)).toEqual(["only"]);
  });
});

// ---------------------------------------------------------------------------
// strict-weight mode
// ---------------------------------------------------------------------------

describe("selectCandidates - strict-weight", () => {
  it("higher weight candidate wins more often", () => {
    const firsts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const out = selectCandidates(
        [mkCandidate("lowW", 0, true, 1), mkCandidate("highW", 0, true, 9)],
        { mode: "strict-weight" },
      );
      const first = out[0].provider.id;
      firsts[first] = (firsts[first] ?? 0) + 1;
    }
    // With weight 9 vs 1, highW should win ~90% of the time
    expect(firsts["highW"]).toBeGreaterThan(800);
    expect(firsts["highW"]).toBeLessThan(980);
  });

  it("ignores quota usage completely", () => {
    // Even with 100% usage and weight 9, high-weight should still dominate
    const firsts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const out = selectCandidates(
        [mkCandidate("lowW", 0, true, 1), mkCandidate("highW", 100, true, 9)],
        { mode: "strict-weight" },
      );
      const first = out[0].provider.id;
      firsts[first] = (firsts[first] ?? 0) + 1;
    }
    // highW still wins most of the time despite 100% usage
    expect(firsts["highW"]).toBeGreaterThan(800);
  });

  it("filters out running-out candidates", () => {
    markQuotaRunningOut("bad");
    const candidates = [
      mkCandidate("bad", 10, true, 10),
      mkCandidate("good", 50, true, 1),
    ];
    const out = selectCandidates(candidates, { mode: "strict-weight" });
    expect(out.map((c) => c.provider.id)).toEqual(["good"]);
    resetQuotaRetries("bad");
  });

  it("filters out unhealthy candidates", () => {
    const candidates = [
      mkCandidate("dead", 0, false, 10),
      mkCandidate("alive", 50, true, 1),
    ];
    const out = selectCandidates(candidates, { mode: "strict-weight" });
    expect(out.map((c) => c.provider.id)).toEqual(["alive"]);
  });
});
