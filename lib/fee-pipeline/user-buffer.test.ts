/**
 * Tests for the user dimension buffer (fee pipeline).
 * Replaces the old keyTokenBuffer.test.ts.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { userDimensionBuffer, type UserQuotaInfo } from "./user-buffer";

// Default quota info with all multipliers set to identity (1/1/1) for simple math
const defaultMultipliers = {
  quotaMultiplierInput: 1.0,
  quotaMultiplierCachedRead: 1.0,
  quotaMultiplierOutput: 1.0,
};

const zeroCounters = {
  rollingInputTokensUsed: 0,
  rollingCachedReadTokensUsed: 0,
  rollingOutputTokensUsed: 0,
  weekInputTokensUsed: 0,
  weekCachedReadTokensUsed: 0,
  weekOutputTokensUsed: 0,
  monthInputTokensUsed: 0,
  monthCachedReadTokensUsed: 0,
  monthOutputTokensUsed: 0,
};

describe("UserDimensionBuffer", () => {
  beforeEach(() => {
    userDimensionBuffer.drain();
    userDimensionBuffer.clearAllQuotaCache();
  });

  // ── increment + drain ──────────────────────────────────────────

  describe("increment + drain", () => {
    it("accumulates per-dimension tokens per user", () => {
      userDimensionBuffer.increment("u1", 100, 20, 50);
      userDimensionBuffer.increment("u1", 50, 5, 10);
      userDimensionBuffer.increment("u2", 200, 0, 80);

      const p1 = userDimensionBuffer.getPending("u1");
      expect(p1.inputTokens).toBe(150);
      expect(p1.cachedReadTokens).toBe(25);
      expect(p1.outputTokens).toBe(60);

      const p2 = userDimensionBuffer.getPending("u2");
      expect(p2.inputTokens).toBe(200);
      expect(p2.cachedReadTokens).toBe(0);
      expect(p2.outputTokens).toBe(80);

      const p3 = userDimensionBuffer.getPending("u3");
      expect(p3.inputTokens).toBe(0);
      expect(p3.cachedReadTokens).toBe(0);
      expect(p3.outputTokens).toBe(0);
    });

    it("drain returns snapshot and clears buffer", () => {
      userDimensionBuffer.increment("u1", 100, 0, 50);
      userDimensionBuffer.increment("u2", 200, 10, 80);

      const drained = userDimensionBuffer.drain();
      expect(drained.get("u1")).toEqual({
        inputTokens: 100,
        cachedReadTokens: 0,
        outputTokens: 50,
      });
      expect(drained.get("u2")).toEqual({
        inputTokens: 200,
        cachedReadTokens: 10,
        outputTokens: 80,
      });
      expect(drained.size).toBe(2);

      expect(userDimensionBuffer.getPending("u1").inputTokens).toBe(0);
      expect(userDimensionBuffer.getPending("u2").inputTokens).toBe(0);
    });
  });

  // ── isQuotaExceeded ────────────────────────────────────────────

  describe("isQuotaExceeded", () => {
    it("returns false when no quota cached", () => {
      expect(userDimensionBuffer.isQuotaExceeded("unknown", 1000, 0, 0)).toBe(
        false,
      );
    });

    it("returns false when all quotas are unlimited (null)", () => {
      userDimensionBuffer.setQuotaCache("u1", {
        rollingQuota: null,
        weekQuota: null,
        monthQuota: null,
        ...zeroCounters,
        ...defaultMultipliers,
      });
      expect(userDimensionBuffer.isQuotaExceeded("u1", 999_999, 0, 0)).toBe(
        false,
      );
    });

    it("returns false when all quotas are unlimited (0)", () => {
      userDimensionBuffer.setQuotaCache("u1", {
        rollingQuota: 0,
        weekQuota: 0,
        monthQuota: 0,
        ...zeroCounters,
        ...defaultMultipliers,
      });
      expect(userDimensionBuffer.isQuotaExceeded("u1", 999_999, 0, 0)).toBe(
        false,
      );
    });

    it("returns true when rolling quota would be exceeded", () => {
      userDimensionBuffer.setQuotaCache("u1", {
        rollingQuota: 1000,
        weekQuota: null,
        monthQuota: null,
        ...zeroCounters,
        rollingInputTokensUsed: 950,
        ...defaultMultipliers,
      });
      // 950 (db) + 0 (pending) + 60 (new) = 1010 >= 1000
      expect(userDimensionBuffer.isQuotaExceeded("u1", 60, 0, 0)).toBe(true);
      // 950 + 0 + 49 = 999 < 1000
      expect(userDimensionBuffer.isQuotaExceeded("u1", 49, 0, 0)).toBe(false);
    });

    it("returns true when week quota would be exceeded", () => {
      userDimensionBuffer.setQuotaCache("u1", {
        rollingQuota: null,
        weekQuota: 5000,
        monthQuota: null,
        ...zeroCounters,
        weekOutputTokensUsed: 4900,
        ...defaultMultipliers,
      });
      expect(userDimensionBuffer.isQuotaExceeded("u1", 0, 0, 101)).toBe(true);
      expect(userDimensionBuffer.isQuotaExceeded("u1", 0, 0, 99)).toBe(false);
    });

    it("returns true when month quota would be exceeded", () => {
      userDimensionBuffer.setQuotaCache("u1", {
        rollingQuota: null,
        weekQuota: null,
        monthQuota: 10000,
        ...zeroCounters,
        monthInputTokensUsed: 9999,
        ...defaultMultipliers,
      });
      expect(userDimensionBuffer.isQuotaExceeded("u1", 2, 0, 0)).toBe(true);
      expect(userDimensionBuffer.isQuotaExceeded("u1", 1, 0, 0)).toBe(true);
      expect(userDimensionBuffer.isQuotaExceeded("u1", 0, 0, 0)).toBe(false);
    });

    it("includes pending tokens in the check", () => {
      userDimensionBuffer.setQuotaCache("u1", {
        rollingQuota: 1000,
        weekQuota: null,
        monthQuota: null,
        ...zeroCounters,
        rollingInputTokensUsed: 800,
        ...defaultMultipliers,
      });
      userDimensionBuffer.increment("u1", 100, 0, 0);
      // 800 (db) + 100 (pending) + 101 (new) = 1001 >= 1000
      expect(userDimensionBuffer.isQuotaExceeded("u1", 101, 0, 0)).toBe(true);
      // 800 + 100 + 99 = 999 < 1000
      expect(userDimensionBuffer.isQuotaExceeded("u1", 99, 0, 0)).toBe(false);
    });

    it("picks the tightest quota dimension", () => {
      userDimensionBuffer.setQuotaCache("u1", {
        rollingQuota: 10000,
        weekQuota: 2000,
        monthQuota: 50000,
        ...zeroCounters,
        weekInputTokensUsed: 1900,
        ...defaultMultipliers,
      });
      // week: 1900 + 101 = 2001 >= 2000 → exceeded
      expect(userDimensionBuffer.isQuotaExceeded("u1", 101, 0, 0)).toBe(true);
      // week: 1900 + 99 = 1999 < 2000 → ok
      expect(userDimensionBuffer.isQuotaExceeded("u1", 99, 0, 0)).toBe(false);
    });

    it("applies multipliers to compute weighted fee", () => {
      userDimensionBuffer.setQuotaCache("u1", {
        rollingQuota: 1000,
        weekQuota: null,
        monthQuota: null,
        ...zeroCounters,
        // 900 already used as: 800 input * 1.0 + 100 output * 1.0
        rollingInputTokensUsed: 800,
        rollingOutputTokensUsed: 100,
        quotaMultiplierInput: 1.0,
        quotaMultiplierCachedRead: 0.1,
        quotaMultiplierOutput: 1.0,
      });
      // Incoming: 50 cached * 0.1 = 5 fee → total 905 < 1000 → ok
      expect(userDimensionBuffer.isQuotaExceeded("u1", 0, 50, 0)).toBe(false);
      // Incoming: 100 input * 1.0 = 100 fee → total 1000 >= 1000 → exceeded
      expect(userDimensionBuffer.isQuotaExceeded("u1", 100, 0, 0)).toBe(true);
    });
  });

  // ── quota cache management ────────────────────────────────────

  describe("quota cache and getMultipliers", () => {
    it("setQuotaCache and clearQuotaCache work", () => {
      const info: UserQuotaInfo = {
        rollingQuota: 100,
        weekQuota: null,
        monthQuota: null,
        ...zeroCounters,
        ...defaultMultipliers,
      };
      userDimensionBuffer.setQuotaCache("u1", info);
      expect(userDimensionBuffer.snapshot().get("u1")).toEqual(info);

      userDimensionBuffer.clearQuotaCache("u1");
      expect(userDimensionBuffer.snapshot().get("u1")).toBeUndefined();
    });

    it("clearAllQuotaCache removes all entries", () => {
      const info: UserQuotaInfo = {
        rollingQuota: null,
        weekQuota: null,
        monthQuota: null,
        ...zeroCounters,
        ...defaultMultipliers,
      };
      userDimensionBuffer.setQuotaCache("u1", info);
      userDimensionBuffer.setQuotaCache("u2", info);
      userDimensionBuffer.clearAllQuotaCache();
      expect(userDimensionBuffer.snapshot().size).toBe(0);
    });

    it("getMultipliers returns defaults when not cached", () => {
      const m = userDimensionBuffer.getMultipliers("unknown");
      expect(m).toEqual({ input: 1.0, cachedRead: 0.1, output: 4.0 });
    });

    it("getMultipliers returns cached values", () => {
      userDimensionBuffer.setQuotaCache("u1", {
        rollingQuota: null,
        weekQuota: null,
        monthQuota: null,
        ...zeroCounters,
        quotaMultiplierInput: 2.0,
        quotaMultiplierCachedRead: 0.5,
        quotaMultiplierOutput: 8.0,
      });
      const m = userDimensionBuffer.getMultipliers("u1");
      expect(m).toEqual({ input: 2.0, cachedRead: 0.5, output: 8.0 });
    });
  });
});
