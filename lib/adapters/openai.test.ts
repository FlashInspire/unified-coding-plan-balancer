import { describe, expect, it } from "vitest";
import { buildUpstreamBody } from "@/lib/adapters/openai";
import type { NormalizedChatRequest } from "@/lib/adapters/base";

function makeReq(
  overrides: Partial<NormalizedChatRequest> = {},
): NormalizedChatRequest {
  return {
    messages: [{ role: "user", content: "hi" }],
    stream: true,
    realModelId: "gpt-4o-2024-11-20",
    maxTokens: 1024,
    temperature: 0.7,
    topP: 1,
    topK: null,
    reasoningEffort: null,
    ...overrides,
  };
}

describe("buildUpstreamBody — stream_options handling", () => {
  it("always injects stream_options.include_usage=true for streaming", () => {
    const out = buildUpstreamBody(makeReq(), true) as Record<string, unknown>;
    expect(out.stream).toBe(true);
    expect(out.stream_options).toEqual({ include_usage: true });
  });

  it("ignores a client stream_options that disables usage", () => {
    const out = buildUpstreamBody(
      makeReq({ extraParams: { stream_options: { include_usage: false } } }),
      true,
    ) as Record<string, unknown>;
    // Client value must be overwritten, never spread/merged.
    expect(out.stream_options).toEqual({ include_usage: true });
  });

  it("drops extra/non-standard client stream_options sub-fields", () => {
    const out = buildUpstreamBody(
      makeReq({
        extraParams: {
          stream_options: {
            include_usage: false,
            continuous_usage_stats: true,
          },
        },
      }),
      true,
    ) as Record<string, unknown>;
    // Only the gateway-controlled flag is forwarded — no client sub-fields.
    expect(out.stream_options).toEqual({ include_usage: true });
  });

  it("requests usage for non-streaming and does not forward client stream_options", () => {
    const out = buildUpstreamBody(
      makeReq({
        stream: false,
        extraParams: { stream_options: { include_usage: false } },
      }),
      false,
    ) as Record<string, unknown>;
    expect(out.stream).toBe(false);
    expect(out.stream_options).toEqual({ include_usage: true });
    expect(out.usage).toEqual({ include: true });
  });

  it("forces gateway-controlled model and max_tokens", () => {
    const out = buildUpstreamBody(
      makeReq({ extraParams: { model: "client-forged", max_tokens: 99 } }),
      true,
    ) as Record<string, unknown>;
    expect(out.model).toBe("gpt-4o-2024-11-20");
    // Client max_tokens is honoured (already capped upstream by resolveParams).
    expect(out.max_tokens).toBe(99);
  });
});
