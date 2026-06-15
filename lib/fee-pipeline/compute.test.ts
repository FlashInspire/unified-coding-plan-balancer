/**
 * Fee Pipeline — compute.ts unit tests.
 */
import { describe, expect, it } from "vitest";
import {
  computeProviderFee,
  computeProviderDimensionFee,
  computeUserFee,
  computeApiKeyTokens,
  computeAll,
} from "./compute";
import type { FeePipelineInput } from "./types";

const base: FeePipelineInput = {
  inputTokens: 100,
  cachedReadTokens: 50,
  cacheWriteTokens: 20,
  outputTokens: 200,
  providerId: "p1",
  apiKeyId: "k1",
  userId: "u1",
  modelId: "m1",
  pmId: "pm1",
  feeRateInput: 1.0,
  feeRateCachedInput: 0.1,
  feeRateOutput: 4.0,
  providerUsageMode: "token",
  userMultiplierInput: 1.0,
  userMultiplierCachedRead: 0.1,
  userMultiplierOutput: 4.0,
};

describe("computeProviderFee", () => {
  it("token mode: input*rateInput + (cachedRead+cacheWrite)*rateCached + output*rateOutput", () => {
    // 100*1 + (50+20)*0.1 + 200*4 = 100 + 7 + 800 = 907
    expect(computeProviderFee(base)).toBe(907);
  });

  it("request mode: returns flat feeRateInput", () => {
    expect(
      computeProviderFee({
        ...base,
        providerUsageMode: "request",
        feeRateInput: 2.5,
      }),
    ).toBe(2.5);
  });

  it("zero tokens yields zero cost (token mode)", () => {
    expect(
      computeProviderFee({
        ...base,
        inputTokens: 0,
        cachedReadTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
      }),
    ).toBe(0);
  });
});

describe("computeProviderDimensionFee", () => {
  it("token mode: splits into inputCost, cachedCost, outputCost", () => {
    const d = computeProviderDimensionFee(base);
    expect(d.inputCost).toBe(100);
    expect(d.cachedCost).toBeCloseTo(7); // 70 * 0.1
    expect(d.outputCost).toBe(800);
  });

  it("request mode: inputCost = feeRateInput, rest zero", () => {
    const d = computeProviderDimensionFee({
      ...base,
      providerUsageMode: "request",
      feeRateInput: 3,
    });
    expect(d.inputCost).toBe(3);
    expect(d.cachedCost).toBe(0);
    expect(d.outputCost).toBe(0);
  });
});

describe("computeUserFee", () => {
  it("input*multiplierInput + (cachedRead+cacheWrite)*multiplierCachedRead + output*multiplierOutput", () => {
    // 100*1 + (50+20)*0.1 + 200*4 = 100 + 7 + 800 = 907
    expect(computeUserFee(base)).toBe(907);
  });

  it("custom multipliers", () => {
    const fee = computeUserFee({
      ...base,
      inputTokens: 1000,
      cachedReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      userMultiplierInput: 2.0,
      userMultiplierCachedRead: 0,
      userMultiplierOutput: 0,
    });
    expect(fee).toBe(2000);
  });
});

describe("computeApiKeyTokens", () => {
  it("sums all 4 dimensions without weighting", () => {
    // 100 + 50 + 20 + 200 = 370
    expect(computeApiKeyTokens(base)).toBe(370);
  });

  it("zero input", () => {
    expect(
      computeApiKeyTokens({
        ...base,
        inputTokens: 0,
        cachedReadTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
      }),
    ).toBe(0);
  });
});

describe("computeAll", () => {
  it("returns all three results", () => {
    const result = computeAll(base);
    expect(result.providerFee).toBe(907);
    expect(result.userFee).toBe(907);
    expect(result.apiKeyTokens).toBe(370);
  });

  it("OpenAI style: cacheWriteTokens is 0, cachedRead gets all cached tokens", () => {
    const openaiInput: FeePipelineInput = {
      ...base,
      inputTokens: 900,
      cachedReadTokens: 100,
      cacheWriteTokens: 0, // OpenAI doesn't expose cache writes
      outputTokens: 500,
    };
    // provider: 900*1 + 100*0.1 + 500*4 = 900 + 10 + 2000 = 2910
    expect(computeAll(openaiInput).providerFee).toBe(2910);
    // apiKey: 900+100+0+500 = 1500
    expect(computeAll(openaiInput).apiKeyTokens).toBe(1500);
  });

  it("Anthropic style: both cacheRead and cacheWrite present", () => {
    const anthropicInput: FeePipelineInput = {
      ...base,
      inputTokens: 500,
      cachedReadTokens: 200,
      cacheWriteTokens: 100,
      outputTokens: 300,
    };
    // provider: 500*1 + (200+100)*0.1 + 300*4 = 500 + 30 + 1200 = 1730
    expect(computeAll(anthropicInput).providerFee).toBe(1730);
    // apiKey: 500+200+100+300 = 1100
    expect(computeAll(anthropicInput).apiKeyTokens).toBe(1100);
  });
});
