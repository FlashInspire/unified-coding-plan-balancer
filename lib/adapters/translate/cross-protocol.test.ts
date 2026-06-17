import { describe, expect, it } from "vitest";
import { translateRequestExtraParams } from "@/lib/adapters/translate/cross-protocol";
import type { NormalizedChatRequest } from "@/lib/adapters/base";

/**
 * Regression tests for cross-protocol request translation.
 *
 * The most critical path is the `tools` / `tool_choice` schema conversion:
 * OpenAI tools use {type:"function", function:{name,description,parameters}}
 * while Anthropic tools use {name, description, input_schema}. Forwarding the
 * wrong shape verbatim causes upstream 400s such as
 * "missing `tools.function` parameter".
 */
function makeReq(extraParams: Record<string, unknown>): NormalizedChatRequest {
  return {
    messages: [],
    stream: false,
    realModelId: "m",
    maxTokens: 100,
    temperature: null,
    topP: null,
    topK: null,
    reasoningEffort: null,
    extraParams,
  };
}

describe("translateRequestExtraParams — same protocol", () => {
  it("returns the request unchanged when from === to", () => {
    const req = makeReq({ tools: [{ name: "x" }], stop: ["a"] });
    const out = translateRequestExtraParams(req, "openai", "openai");
    expect(out).toBe(req);
  });

  it("returns the request unchanged when extraParams is undefined", () => {
    const req: NormalizedChatRequest = {
      messages: [],
      stream: false,
      realModelId: "m",
      maxTokens: 100,
      temperature: null,
      topP: null,
      topK: null,
      reasoningEffort: null,
    };
    expect(translateRequestExtraParams(req, "openai", "anthropic")).toBe(req);
  });
});

describe("translateRequestExtraParams — stop sequences", () => {
  it("openai→anthropic: stop → stop_sequences", () => {
    const out = translateRequestExtraParams(
      makeReq({ stop: ["end"] }),
      "openai",
      "anthropic",
    );
    expect(out.extraParams?.stop).toBeUndefined();
    expect(out.extraParams?.stop_sequences).toEqual(["end"]);
  });

  it("anthropic→openai: stop_sequences → stop", () => {
    const out = translateRequestExtraParams(
      makeReq({ stop_sequences: ["end"] }),
      "anthropic",
      "openai",
    );
    expect(out.extraParams?.stop_sequences).toBeUndefined();
    expect(out.extraParams?.stop).toEqual(["end"]);
  });

  it("does not overwrite an existing target field (both kept)", () => {
    const out = translateRequestExtraParams(
      makeReq({ stop: ["a"], stop_sequences: ["b"] }),
      "openai",
      "anthropic",
    );
    // stop_sequences already present, so the conversion guard skips — both
    // fields are preserved verbatim (the client explicitly set stop_sequences).
    expect(out.extraParams?.stop_sequences).toEqual(["b"]);
    expect(out.extraParams?.stop).toEqual(["a"]);
  });
});

describe("translateRequestExtraParams — tools", () => {
  const openaiTool = {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get the weather",
      parameters: { type: "object", properties: { city: { type: "string" } } },
    },
  };
  const anthropicTool = {
    name: "get_weather",
    description: "Get the weather",
    input_schema: { type: "object", properties: { city: { type: "string" } } },
  };

  it("openai→anthropic: converts OpenAI tool shape to Anthropic", () => {
    const out = translateRequestExtraParams(
      makeReq({ tools: [openaiTool] }),
      "openai",
      "anthropic",
    );
    expect(out.extraParams?.tools).toEqual([anthropicTool]);
  });

  it("openai→anthropic: handles a tool without description", () => {
    const out = translateRequestExtraParams(
      makeReq({
        tools: [
          { type: "function", function: { name: "no_desc", parameters: {} } },
        ],
      }),
      "openai",
      "anthropic",
    );
    expect(out.extraParams?.tools).toEqual([
      { name: "no_desc", input_schema: {} },
    ]);
  });

  it("openai→anthropic: defaults missing parameters to empty object schema", () => {
    const out = translateRequestExtraParams(
      makeReq({ tools: [{ type: "function", function: { name: "x" } }] }),
      "openai",
      "anthropic",
    );
    expect(out.extraParams?.tools).toEqual([
      { name: "x", input_schema: { type: "object", properties: {} } },
    ]);
  });

  it("openai→anthropic: idempotent on already-anthropic-shaped tools", () => {
    const out = translateRequestExtraParams(
      makeReq({ tools: [anthropicTool] }),
      "openai",
      "anthropic",
    );
    expect(out.extraParams?.tools).toEqual([anthropicTool]);
  });

  it("anthropic→openai: converts Anthropic tool shape to OpenAI", () => {
    const out = translateRequestExtraParams(
      makeReq({ tools: [anthropicTool] }),
      "anthropic",
      "openai",
    );
    expect(out.extraParams?.tools).toEqual([openaiTool]);
  });

  it("anthropic→openai: handles a tool without description", () => {
    const out = translateRequestExtraParams(
      makeReq({ tools: [{ name: "no_desc", input_schema: {} }] }),
      "anthropic",
      "openai",
    );
    expect(out.extraParams?.tools).toEqual([
      { type: "function", function: { name: "no_desc", parameters: {} } },
    ]);
  });

  it("anthropic→openai: maps input_schema → parameters, falling back to empty schema", () => {
    const out = translateRequestExtraParams(
      makeReq({ tools: [{ name: "x" }] }),
      "anthropic",
      "openai",
    );
    expect(out.extraParams?.tools).toEqual([
      {
        type: "function",
        function: { name: "x", parameters: { type: "object", properties: {} } },
      },
    ]);
  });

  it("anthropic→openai: idempotent on already-openai-shaped tools", () => {
    const out = translateRequestExtraParams(
      makeReq({ tools: [openaiTool] }),
      "anthropic",
      "openai",
    );
    expect(out.extraParams?.tools).toEqual([openaiTool]);
  });
});

describe("translateRequestExtraParams — tool_choice", () => {
  it("openai→anthropic: string 'auto' → {type:'auto'}", () => {
    const out = translateRequestExtraParams(
      makeReq({ tool_choice: "auto" }),
      "openai",
      "anthropic",
    );
    expect(out.extraParams?.tool_choice).toEqual({ type: "auto" });
  });

  it("openai→anthropic: string 'required' → {type:'any'}", () => {
    const out = translateRequestExtraParams(
      makeReq({ tool_choice: "required" }),
      "openai",
      "anthropic",
    );
    expect(out.extraParams?.tool_choice).toEqual({ type: "any" });
  });

  it("openai→anthropic: object {type:'function',function:{name}} → {type:'tool',name}", () => {
    const out = translateRequestExtraParams(
      makeReq({ tool_choice: { type: "function", function: { name: "x" } } }),
      "openai",
      "anthropic",
    );
    expect(out.extraParams?.tool_choice).toEqual({ type: "tool", name: "x" });
  });

  it("anthropic→openai: {type:'auto'} → 'auto'", () => {
    const out = translateRequestExtraParams(
      makeReq({ tool_choice: { type: "auto" } }),
      "anthropic",
      "openai",
    );
    expect(out.extraParams?.tool_choice).toBe("auto");
  });

  it("anthropic→openai: {type:'any'} → 'required'", () => {
    const out = translateRequestExtraParams(
      makeReq({ tool_choice: { type: "any" } }),
      "anthropic",
      "openai",
    );
    expect(out.extraParams?.tool_choice).toBe("required");
  });

  it("anthropic→openai: {type:'tool',name:'x'} → {type:'function',function:{name:'x'}}", () => {
    const out = translateRequestExtraParams(
      makeReq({ tool_choice: { type: "tool", name: "x" } }),
      "anthropic",
      "openai",
    );
    expect(out.extraParams?.tool_choice).toEqual({
      type: "function",
      function: { name: "x" },
    });
  });
});

describe("translateRequestExtraParams — field removal", () => {
  it("openai→anthropic: removes OpenAI-only fields", () => {
    const out = translateRequestExtraParams(
      makeReq({
        frequency_penalty: 0.5,
        presence_penalty: 0.5,
        logit_bias: {},
        n: 2,
        response_format: { type: "json_object" },
        seed: 42,
        user: "u",
        parallel_tool_calls: true,
      }),
      "openai",
      "anthropic",
    );
    expect(out.extraParams).toEqual({});
  });

  it("anthropic→openai: removes Anthropic-only fields", () => {
    const out = translateRequestExtraParams(
      makeReq({
        thinking: { type: "enabled", budget_tokens: 2048 },
        metadata: { user_id: "u" },
      }),
      "anthropic",
      "openai",
    );
    expect(out.extraParams).toEqual({});
  });

  it("preserves passthrough fields (e.g. temperature from extraParams)", () => {
    const out = translateRequestExtraParams(
      makeReq({ temperature: 0.7, max_tokens: 500 }),
      "openai",
      "anthropic",
    );
    expect(out.extraParams?.temperature).toBe(0.7);
    expect(out.extraParams?.max_tokens).toBe(500);
  });
});
