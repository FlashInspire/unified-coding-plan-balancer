import { describe, expect, it, beforeEach } from "vitest";
import { userTokenBuffer, type UserQuotaInfo } from "./keyTokenBuffer";

describe("UserTokenBuffer", () => {
  beforeEach(() => {
    userTokenBuffer.drain();
    userTokenBuffer.clearAllQuotaCache();
  });

  describe("increment + drain", () => {
    it("accumulates tokens per user", () => {
      userTokenBuffer.increment("u1", 100);
      userTokenBuffer.increment("u1", 50);
      userTokenBuffer.increment("u2", 200);

      expect(userTokenBuffer.getPending("u1")).toBe(150);
      expect(userTokenBuffer.getPending("u2")).toBe(200);
      expect(userTokenBuffer.getPending("u3")).toBe(0);
    });

    it("ignores zero or negative tokens", () => {
      userTokenBuffer.increment("u1", 0);
      userTokenBuffer.increment("u1", -10);
      expect(userTokenBuffer.getPending("u1")).toBe(0);
    });

    it("drain returns snapshot and clears buffer", () => {
      userTokenBuffer.increment("u1", 100);
      userTokenBuffer.increment("u2", 200);

      const drained = userTokenBuffer.drain();
      expect(drained.get("u1")).toBe(100);
      expect(drained.get("u2")).toBe(200);
      expect(drained.size).toBe(2);

      // Buffer should be empty after drain
      expect(userTokenBuffer.getPending("u1")).toBe(0);
      expect(userTokenBuffer.getPending("u2")).toBe(0);
    });
  });

  describe("isQuotaExceeded", () => {
    it("returns false when no quota cached", () => {
      expect(userTokenBuffer.isQuotaExceeded("unknown", 1000)).toBe(false);
    });

    it("returns false when quota is unlimited (null)", () => {
      userTokenBuffer.setQuotaCache("u1", {
        rollingQuota: null,
        weekQuota: null,
        monthQuota: null,
        tokensUsed: 0,
      });
      expect(userTokenBuffer.isQuotaExceeded("u1", 999_999)).toBe(false);
    });

    it("returns false when quota is unlimited (0)", () => {
      userTokenBuffer.setQuotaCache("u1", {
        rollingQuota: 0,
        weekQuota: 0,
        monthQuota: 0,
        tokensUsed: 0,
      });
      expect(userTokenBuffer.isQuotaExceeded("u1", 999_999)).toBe(false);
    });

    it("returns true when rolling quota would be exceeded", () => {
      userTokenBuffer.setQuotaCache("u1", {
        rollingQuota: 1000,
        weekQuota: null,
        monthQuota: null,
        tokensUsed: 950,
      });
      // 950 (db) + 0 (pending) + 60 (new) = 1010 > 1000
      expect(userTokenBuffer.isQuotaExceeded("u1", 60)).toBe(true);
      // 950 + 0 + 49 = 999 < 1000
      expect(userTokenBuffer.isQuotaExceeded("u1", 49)).toBe(false);
    });

    it("returns true when week quota would be exceeded", () => {
      userTokenBuffer.setQuotaCache("u1", {
        rollingQuota: null,
        weekQuota: 5000,
        monthQuota: null,
        tokensUsed: 4900,
      });
      expect(userTokenBuffer.isQuotaExceeded("u1", 101)).toBe(true);
      expect(userTokenBuffer.isQuotaExceeded("u1", 99)).toBe(false);
    });

    it("returns true when month quota would be exceeded", () => {
      userTokenBuffer.setQuotaCache("u1", {
        rollingQuota: null,
        weekQuota: null,
        monthQuota: 10000,
        tokensUsed: 9999,
      });
      // 9999 + 2 = 10001 >= 10000 → exceeded
      expect(userTokenBuffer.isQuotaExceeded("u1", 2)).toBe(true);
      // 9999 + 1 = 10000 >= 10000 → exceeded (at-limit counts as exceeded)
      expect(userTokenBuffer.isQuotaExceeded("u1", 1)).toBe(true);
      // 9999 + 0 = 9999 < 10000 → ok
      expect(userTokenBuffer.isQuotaExceeded("u1", 0)).toBe(false);
    });

    it("includes pending tokens in the check", () => {
      userTokenBuffer.setQuotaCache("u1", {
        rollingQuota: 1000,
        weekQuota: null,
        monthQuota: null,
        tokensUsed: 800,
      });
      userTokenBuffer.increment("u1", 100);
      // 800 (db) + 100 (pending) + 101 (new) = 1001 > 1000
      expect(userTokenBuffer.isQuotaExceeded("u1", 101)).toBe(true);
      // 800 + 100 + 99 = 999 < 1000
      expect(userTokenBuffer.isQuotaExceeded("u1", 99)).toBe(false);
    });

    it("picks the tightest quota dimension", () => {
      userTokenBuffer.setQuotaCache("u1", {
        rollingQuota: 10000, // loose
        weekQuota: 2000, // tight
        monthQuota: 50000, // loose
        tokensUsed: 1900,
      });
      // week: 1900 + 101 = 2001 > 2000 → exceeded
      expect(userTokenBuffer.isQuotaExceeded("u1", 101)).toBe(true);
      // week: 1900 + 99 = 1999 < 2000 → ok
      expect(userTokenBuffer.isQuotaExceeded("u1", 99)).toBe(false);
    });
  });

  describe("quota cache management", () => {
    it("setQuotaCache and clearQuotaCache work", () => {
      const info: UserQuotaInfo = {
        rollingQuota: 100,
        weekQuota: null,
        monthQuota: null,
        tokensUsed: 50,
      };
      userTokenBuffer.setQuotaCache("u1", info);
      expect(userTokenBuffer.snapshot().get("u1")).toEqual(info);

      userTokenBuffer.clearQuotaCache("u1");
      expect(userTokenBuffer.snapshot().get("u1")).toBeUndefined();
    });

    it("clearAllQuotaCache removes all entries", () => {
      userTokenBuffer.setQuotaCache("u1", {
        rollingQuota: null,
        weekQuota: null,
        monthQuota: null,
        tokensUsed: 0,
      });
      userTokenBuffer.setQuotaCache("u2", {
        rollingQuota: null,
        weekQuota: null,
        monthQuota: null,
        tokensUsed: 0,
      });
      userTokenBuffer.clearAllQuotaCache();
      expect(userTokenBuffer.snapshot().size).toBe(0);
    });
  });
});
