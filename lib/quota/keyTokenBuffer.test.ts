import { describe, expect, it, beforeEach } from "vitest";
import { keyTokenBuffer, type KeyQuotaInfo } from "./keyTokenBuffer";

describe("KeyTokenBuffer", () => {
  beforeEach(() => {
    keyTokenBuffer.drain();
    keyTokenBuffer.clearAllQuotaCache();
  });

  describe("increment + drain", () => {
    it("accumulates tokens per key", () => {
      keyTokenBuffer.increment("k1", 100);
      keyTokenBuffer.increment("k1", 50);
      keyTokenBuffer.increment("k2", 200);

      expect(keyTokenBuffer.getPending("k1")).toBe(150);
      expect(keyTokenBuffer.getPending("k2")).toBe(200);
      expect(keyTokenBuffer.getPending("k3")).toBe(0);
    });

    it("ignores zero or negative tokens", () => {
      keyTokenBuffer.increment("k1", 0);
      keyTokenBuffer.increment("k1", -10);
      expect(keyTokenBuffer.getPending("k1")).toBe(0);
    });

    it("drain returns snapshot and clears buffer", () => {
      keyTokenBuffer.increment("k1", 100);
      keyTokenBuffer.increment("k2", 200);

      const drained = keyTokenBuffer.drain();
      expect(drained.get("k1")).toBe(100);
      expect(drained.get("k2")).toBe(200);
      expect(drained.size).toBe(2);

      // Buffer should be empty after drain
      expect(keyTokenBuffer.getPending("k1")).toBe(0);
      expect(keyTokenBuffer.getPending("k2")).toBe(0);
    });
  });

  describe("isQuotaExceeded", () => {
    it("returns false when no quota cached", () => {
      expect(keyTokenBuffer.isQuotaExceeded("unknown", 1000)).toBe(false);
    });

    it("returns false when quota is unlimited (null)", () => {
      keyTokenBuffer.setQuotaCache("k1", {
        rollingQuota: null,
        weekQuota: null,
        monthQuota: null,
        tokensUsed: 0,
      });
      expect(keyTokenBuffer.isQuotaExceeded("k1", 999_999)).toBe(false);
    });

    it("returns false when quota is unlimited (0)", () => {
      keyTokenBuffer.setQuotaCache("k1", {
        rollingQuota: 0,
        weekQuota: 0,
        monthQuota: 0,
        tokensUsed: 0,
      });
      expect(keyTokenBuffer.isQuotaExceeded("k1", 999_999)).toBe(false);
    });

    it("returns true when rolling quota would be exceeded", () => {
      keyTokenBuffer.setQuotaCache("k1", {
        rollingQuota: 1000,
        weekQuota: null,
        monthQuota: null,
        tokensUsed: 950,
      });
      // 950 (db) + 0 (pending) + 60 (new) = 1010 > 1000
      expect(keyTokenBuffer.isQuotaExceeded("k1", 60)).toBe(true);
      // 950 + 0 + 49 = 999 < 1000
      expect(keyTokenBuffer.isQuotaExceeded("k1", 49)).toBe(false);
    });

    it("returns true when week quota would be exceeded", () => {
      keyTokenBuffer.setQuotaCache("k1", {
        rollingQuota: null,
        weekQuota: 5000,
        monthQuota: null,
        tokensUsed: 4900,
      });
      expect(keyTokenBuffer.isQuotaExceeded("k1", 101)).toBe(true);
      expect(keyTokenBuffer.isQuotaExceeded("k1", 99)).toBe(false);
    });

    it("returns true when month quota would be exceeded", () => {
      keyTokenBuffer.setQuotaCache("k1", {
        rollingQuota: null,
        weekQuota: null,
        monthQuota: 10000,
        tokensUsed: 9999,
      });
      // 9999 + 2 = 10001 >= 10000 → exceeded
      expect(keyTokenBuffer.isQuotaExceeded("k1", 2)).toBe(true);
      // 9999 + 1 = 10000 >= 10000 → exceeded (at-limit counts as exceeded)
      expect(keyTokenBuffer.isQuotaExceeded("k1", 1)).toBe(true);
      // 9999 + 0 = 9999 < 10000 → ok
      expect(keyTokenBuffer.isQuotaExceeded("k1", 0)).toBe(false);
    });

    it("includes pending tokens in the check", () => {
      keyTokenBuffer.setQuotaCache("k1", {
        rollingQuota: 1000,
        weekQuota: null,
        monthQuota: null,
        tokensUsed: 800,
      });
      keyTokenBuffer.increment("k1", 100);
      // 800 (db) + 100 (pending) + 101 (new) = 1001 > 1000
      expect(keyTokenBuffer.isQuotaExceeded("k1", 101)).toBe(true);
      // 800 + 100 + 99 = 999 < 1000
      expect(keyTokenBuffer.isQuotaExceeded("k1", 99)).toBe(false);
    });

    it("picks the tightest quota dimension", () => {
      keyTokenBuffer.setQuotaCache("k1", {
        rollingQuota: 10000, // loose
        weekQuota: 2000, // tight
        monthQuota: 50000, // loose
        tokensUsed: 1900,
      });
      // week: 1900 + 101 = 2001 > 2000 → exceeded
      expect(keyTokenBuffer.isQuotaExceeded("k1", 101)).toBe(true);
      // week: 1900 + 99 = 1999 < 2000 → ok
      expect(keyTokenBuffer.isQuotaExceeded("k1", 99)).toBe(false);
    });
  });

  describe("quota cache management", () => {
    it("setQuotaCache and clearQuotaCache work", () => {
      const info: KeyQuotaInfo = {
        rollingQuota: 100,
        weekQuota: null,
        monthQuota: null,
        tokensUsed: 50,
      };
      keyTokenBuffer.setQuotaCache("k1", info);
      expect(keyTokenBuffer.snapshot().get("k1")).toEqual(info);

      keyTokenBuffer.clearQuotaCache("k1");
      expect(keyTokenBuffer.snapshot().get("k1")).toBeUndefined();
    });

    it("clearAllQuotaCache removes all entries", () => {
      keyTokenBuffer.setQuotaCache("k1", {
        rollingQuota: null,
        weekQuota: null,
        monthQuota: null,
        tokensUsed: 0,
      });
      keyTokenBuffer.setQuotaCache("k2", {
        rollingQuota: null,
        weekQuota: null,
        monthQuota: null,
        tokensUsed: 0,
      });
      keyTokenBuffer.clearAllQuotaCache();
      expect(keyTokenBuffer.snapshot().size).toBe(0);
    });
  });
});
