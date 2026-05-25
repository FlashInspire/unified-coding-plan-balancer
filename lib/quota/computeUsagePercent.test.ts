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

  it("treats zero quota as exhausted", () => {
    const usage = computeQuotaUsagePercent({
      rollingQuota: 0,
      rollingQuotaUsed: 0,
      weekQuota: null,
      weekQuotaUsed: 0,
      monthQuota: null,
      monthQuotaUsed: 0,
    });

    expect(usage).toBe(100);
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
});
