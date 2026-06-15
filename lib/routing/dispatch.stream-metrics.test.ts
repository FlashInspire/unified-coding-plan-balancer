import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Regression tests for in-flight log-row closing on streaming dispatch.
 *
 * A streaming request inserts a log row with status=0 (InFlight) up front.
 * When the stream terminates — by success, upstream error, or a synchronous
 * failure while opening the stream — the row MUST be closed synchronously with
 * its final HTTP status so it never remains stuck at InFlight.
 */

// Shared spies. Declared via vi.hoisted so they exist before the hoisted
// vi.mock factories below reference them.
const h = vi.hoisted(() => ({
  logRequestStart: vi.fn(() => 1),
  logRequestUpdate: vi.fn(),
  bufferPush: vi.fn(),
  findDirect: vi.fn(),
  incrementQuotaUsedByRequest: vi.fn(async () => {}),
  incrementQuotaUsedByTokens: vi.fn(async () => {}),
  chatStream: vi.fn(),
}));

vi.mock("@/lib/metrics/flusher", () => ({
  logRequestStart: h.logRequestStart,
  logRequestUpdate: h.logRequestUpdate,
}));

vi.mock("@/lib/metrics/buffer", () => ({
  metricsBuffer: { push: h.bufferPush },
}));

vi.mock("@/lib/repositories/providerModelRepo", () => ({
  providerModelRepo: { findDirect: h.findDirect },
}));

vi.mock("@/lib/repositories/modelRepo", () => ({
  modelRepo: { findById: vi.fn(async () => ({ id: "model-x" })) },
}));

vi.mock("@/lib/repositories/providerRepo", () => ({
  providerRepo: {
    incrementQuotaUsedByRequest: h.incrementQuotaUsedByRequest,
    incrementQuotaUsedByTokens: h.incrementQuotaUsedByTokens,
    update: vi.fn(async () => {}),
  },
}));

vi.mock("@/lib/adapters", () => ({
  getAdapter: () => ({ chatStream: h.chatStream }),
}));

vi.mock("@/lib/routing/resolveParams", () => ({
  resolveModelParams: () => ({
    realModelId: "real-x",
    maxTokens: 100,
    temperature: null,
    topP: null,
    topK: null,
    reasoningEffort: null,
    contextLength: 8000,
    includeReasoningInRequest: false,
  }),
}));

vi.mock("@/lib/routing/sticky", () => ({
  getStickyProvider: vi.fn(async () => null),
  setStickyProvider: vi.fn(async () => {}),
}));

vi.mock("@/lib/fee-pipeline/user-buffer", () => ({
  userDimensionBuffer: {
    increment: vi.fn(),
    isQuotaExceeded: vi.fn(() => false),
  },
}));

vi.mock("@/lib/fee-pipeline/record", () => ({
  recordUsage: vi.fn(async () => ({
    providerFee: 0,
    userFee: 0,
    apiKeyTokens: 0,
  })),
}));

vi.mock("@/lib/routing/activeRequests", () => ({
  activeRequests: { incr: vi.fn(), decr: vi.fn() },
}));

// Real modules used below.
import { UpstreamError } from "@/lib/adapters/openai";
import { dispatchDirectChatStream } from "@/lib/routing/dispatch";
import type { NormalizedChunk } from "@/lib/adapters/base";

const provider = {
  id: "prov-1",
  name: "Provider One",
  baseUrlOpenai: "https://up.example/v1",
  apiKeyOpenai: "sk-up-xxxx",
  baseUrlAnthropic: null,
  apiKeyAnthropic: null,
  headersTemplate: "{}",
  usageMode: "request",
};
const pm = {
  id: "pm-1",
  feeRateInput: 1,
  feeRateCachedInput: 0.1,
  feeRateOutput: 4,
};

const ctx = {
  apiKeyId: "key-1",
  apiKeyName: "key",
  userId: null,
  apiModeIn: "openai" as const,
  ip: null,
  userAgent: null,
};

function setCandidate() {
  h.findDirect.mockResolvedValue({ provider, pm });
}

async function drain(iterator: AsyncIterable<NormalizedChunk>): Promise<void> {
  for await (const chunk of iterator) {
    void chunk;
  }
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("dispatchDirectChatStream in-flight row closing", () => {
  it("closes the row with the upstream HTTP status when the stream errors mid-flight", async () => {
    setCandidate();
    h.chatStream.mockReturnValue(
      (async function* () {
        yield { delta: "hi" } as NormalizedChunk;
        throw new UpstreamError(429, "rate limited");
      })(),
    );

    const result = await dispatchDirectChatStream(
      "prov-1",
      "model-x",
      [{ role: "user", content: "hello" }],
      {},
      ctx,
    );

    await expect(drain(result.iterator)).rejects.toBeInstanceOf(UpstreamError);

    // The in-flight row (id=1) must be closed with the real HTTP status.
    expect(h.logRequestUpdate).toHaveBeenCalledWith(
      1,
      expect.any(Number),
      expect.objectContaining({ status: 429 }),
    );
    // It must never be left at status=0 (InFlight).
    const closingCalls = h.logRequestUpdate.mock.calls.filter(
      (c) => (c[2] as { status?: number }).status !== undefined,
    );
    expect(closingCalls.length).toBeGreaterThan(0);
    expect(
      closingCalls.every((c) => (c[2] as { status?: number }).status !== 0),
    ).toBe(true);
  });

  it("closes the row with a synchronous failure status when opening the stream throws", async () => {
    setCandidate();
    h.chatStream.mockImplementation(() => {
      throw new UpstreamError(403, "forbidden");
    });

    await expect(
      dispatchDirectChatStream(
        "prov-1",
        "model-x",
        [{ role: "user", content: "hello" }],
        {},
        ctx,
      ),
    ).rejects.toBeInstanceOf(UpstreamError);

    expect(h.logRequestUpdate).toHaveBeenCalledWith(
      1,
      expect.any(Number),
      expect.objectContaining({ status: 403 }),
    );
  });

  it("closes the row with status 200 and provider-reported tokens on success", async () => {
    setCandidate();
    h.chatStream.mockReturnValue(
      (async function* () {
        yield { delta: "hi" } as NormalizedChunk;
        yield {
          delta: "",
          usage: {
            inputTokens: 10,
            cachedReadTokens: 0,
            cacheWriteTokens: 0,
            outputTokens: 5,
          },
          finishReason: "stop",
        } as NormalizedChunk;
      })(),
    );

    const result = await dispatchDirectChatStream(
      "prov-1",
      "model-x",
      [{ role: "user", content: "hello" }],
      {},
      ctx,
    );
    await drain(result.iterator);

    expect(h.logRequestUpdate).toHaveBeenCalledWith(
      1,
      expect.any(Number),
      expect.objectContaining({
        status: 200,
        outputTokens: 5,
        inputTokens: 10,
      }),
    );
  });
});
