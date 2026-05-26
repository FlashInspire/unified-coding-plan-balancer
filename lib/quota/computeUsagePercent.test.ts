import { describe, expect, it } from "vitest";
import { computeQuotaUsagePercent } from "@/lib/quota/computeUsagePercent";

describe("computeQuotaUsagePercent", () => {
  it("returns null when all quotas are unlimited", () => {
    const usage = computeQuotaUsagePercent({
      rollingQuota: null,
      rollingQuotaUsed: 10,
      weekQuota: null,
      weekQuotaUsed: 10,
      monthQuota: null,
      monthQuotaUsed: 10,
    });

    expect(usage).toBeNull();
  });

  it("treats zero quota as unlimited (same as null)", () => {
    const usage = computeQuotaUsagePercent({
      rollingQuota: 0,
      rollingQuotaUsed: 10,
      weekQuota: null,
      weekQuotaUsed: 0,
      monthQuota: null,
      monthQuotaUsed: 0,
    });

    expect(usage).toBeNull();
  });

  it("uses the tightest remaining quota dimension", () => {
    const usage = computeQuotaUsagePercent({
      rollingQuota: 100,
      rollingQuotaUsed: 20,
      weekQuota: 50,
      weekQuotaUsed: 40,
      monthQuota: 1000,
      monthQuotaUsed: 100,
    });

    // rolling: 20%, week: 80%, month: 10% -> week dominates
    expect(usage).toBe(80);
  });

  it("caps exhausted positive quotas at 100", () => {
    const usage = computeQuotaUsagePercent({
      rollingQuota: 10,
      rollingQuotaUsed: 99,
      weekQuota: null,
      weekQuotaUsed: 0,
      monthQuota: null,
      monthQuotaUsed: 0,
    });

    expect(usage).toBe(100);
  });

  it("ignores null quotas when selecting dominant dimension", () => {
    const usage = computeQuotaUsagePercent({
      rollingQuota: null,
      rollingQuotaUsed: 100,
      weekQuota: 20,
      weekQuotaUsed: 5,
      monthQuota: null,
      monthQuotaUsed: 300,
    });

    expect(usage).toBe(25);
  });

  it("ignores zero quotas alongside real quotas", () => {
    const usage = computeQuotaUsagePercent({
      rollingQuota: 0,
      rollingQuotaUsed: 999,
      weekQuota: 100,
      weekQuotaUsed: 40,
      monthQuota: 0,
      monthQuotaUsed: 500,
    });

    // Only weekQuota matters: 40%
    expect(usage).toBe(40);
  });

  // -------------------------------------------------------------------------
  // Token mode
  // -------------------------------------------------------------------------
  describe("token mode", () => {
    it("sums input + cachedInput + output tokens in token mode", () => {
      const usage = computeQuotaUsagePercent({
        usageMode: "token",
        rollingQuota: 1000,
        rollingQuotaUsed: 100, // input tokens
        rollingCacheInputTokensUsed: 50,
        rollingOutputTokensUsed: 200,
        weekQuota: null,
        weekQuotaUsed: 0,
        monthQuota: null,
        monthQuotaUsed: 0,
      });

      // total used = 100 + 50 + 200 = 350 → 35%
      expect(usage).toBe(35);
    });

    it("picks tightest dimension in token mode", () => {
      const usage = computeQuotaUsagePercent({
        usageMode: "token",
        rollingQuota: 1000,
        rollingQuotaUsed: 100,
        rollingCacheInputTokensUsed: 0,
        rollingOutputTokensUsed: 0,
        weekQuota: 500,
        weekQuotaUsed: 200,
        weekCacheInputTokensUsed: 100,
        weekOutputTokensUsed: 150,
        monthQuota: null,
        monthQuotaUsed: 0,
      });

      // rolling: 100/1000 = 10%, week: (200+100+150)/500 = 90% → week dominates
      expect(usage).toBe(90);
    });

    it("defaults missing token counters to 0 in token mode", () => {
      const usage = computeQuotaUsagePercent({
        usageMode: "token",
        rollingQuota: 100,
        rollingQuotaUsed: 50,
        weekQuota: null,
        weekQuotaUsed: 0,
        monthQuota: null,
        monthQuotaUsed: 0,
      });

      // Only input: 50/100 = 50%
      expect(usage).toBe(50);
    });

    it("request mode ignores token counters", () => {
      const usage = computeQuotaUsagePercent({
        usageMode: "request",
        rollingQuota: 100,
        rollingQuotaUsed: 10,
        rollingCacheInputTokensUsed: 999,
        rollingOutputTokensUsed: 999,
        weekQuota: null,
        weekQuotaUsed: 0,
        monthQuota: null,
        monthQuotaUsed: 0,
      });

      // Only rollingQuotaUsed: 10/100 = 10%
      expect(usage).toBe(10);
    });
  });
});
