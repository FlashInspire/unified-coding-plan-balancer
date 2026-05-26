import { describe, expect, it } from "vitest";
import { computeNextResetAt } from "@/lib/quota/reset-scheduler";

describe("computeNextResetAt", () => {
  // -----------------------------------------------------------------------
  // Rolling
  // -----------------------------------------------------------------------
  describe("rolling (offset=0)", () => {
    it("snaps to the next hour that is a multiple of 5", () => {
      // 2026-05-26 03:15 → next is 05:00
      const now = new Date("2026-05-26T03:15:00Z");
      const next = computeNextResetAt("rolling", now, 0);
      expect(next.getUTCHours()).toBe(5);
      expect(next.getUTCMinutes()).toBe(0);
      expect(next.getUTCDate()).toBe(26);
    });

    it("wraps to the next day when no more slots today", () => {
      // 2026-05-26 22:30 → next valid hour with offset 0 is 00:00 next day
      const now = new Date("2026-05-26T22:30:00Z");
      const next = computeNextResetAt("rolling", now, 0);
      expect(next.getUTCHours()).toBe(0);
      expect(next.getUTCMinutes()).toBe(0);
      expect(next.getUTCDate()).toBe(27);
    });

    it("when exactly at a boundary hour, advances to the next slot", () => {
      // 2026-05-26 10:00:00 → next is 15:00 (since we add 1 minute first)
      const now = new Date("2026-05-26T10:00:00Z");
      const next = computeNextResetAt("rolling", now, 0);
      expect(next.getUTCHours()).toBe(15);
    });
  });

  describe("rolling (offset=2)", () => {
    it("snaps to hours 2,7,12,17,22", () => {
      // 2026-05-26 03:15 → next is 07:00
      const now = new Date("2026-05-26T03:15:00Z");
      const next = computeNextResetAt("rolling", now, 2);
      expect(next.getUTCHours()).toBe(7);
      expect(next.getUTCMinutes()).toBe(0);
    });

    it("wraps correctly at end of day", () => {
      // 2026-05-26 23:00 → next is 02:00 next day
      const now = new Date("2026-05-26T23:00:00Z");
      const next = computeNextResetAt("rolling", now, 2);
      expect(next.getUTCHours()).toBe(2);
      expect(next.getUTCDate()).toBe(27);
    });
  });

  describe("rolling (offset=22)", () => {
    it("22%5=2 so valid hours are 2,7,12,17,22 — from 15:00 next is 17:00", () => {
      // 2026-05-26 15:00 → next is 17:00 (same modulo class as offset=2)
      const now = new Date("2026-05-26T15:00:00Z");
      const next = computeNextResetAt("rolling", now, 22);
      expect(next.getUTCHours()).toBe(17);
    });

    it("from 18:00, next is 22:00", () => {
      const now = new Date("2026-05-26T18:00:00Z");
      const next = computeNextResetAt("rolling", now, 22);
      expect(next.getUTCHours()).toBe(22);
    });
  });

  // -----------------------------------------------------------------------
  // Weekly
  // -----------------------------------------------------------------------
  describe("week", () => {
    it("from Wednesday → next Monday", () => {
      // 2026-05-27 is Wednesday
      const now = new Date("2026-05-27T12:00:00Z");
      const next = computeNextResetAt("week", now);
      expect(next.getUTCDay()).toBe(1); // Monday
      expect(next.getUTCHours()).toBe(0);
      expect(next.getUTCDate()).toBe(1); // June 1
    });

    it("from Monday past midnight → next Monday", () => {
      // 2026-05-25 is Monday, 14:00
      const now = new Date("2026-05-25T14:00:00Z");
      const next = computeNextResetAt("week", now);
      expect(next.getUTCDay()).toBe(1);
      expect(next.getUTCDate()).toBe(1); // June 1
    });

    it("from Sunday → next day (Monday)", () => {
      // 2026-05-31 is Sunday
      const now = new Date("2026-05-31T20:00:00Z");
      const next = computeNextResetAt("week", now);
      expect(next.getUTCDay()).toBe(1);
      expect(next.getUTCDate()).toBe(1); // June 1
    });
  });

  // -----------------------------------------------------------------------
  // Monthly
  // -----------------------------------------------------------------------
  describe("month", () => {
    it("from mid-month → 1st of next month", () => {
      // 2026-05-15 → June 1
      const now = new Date("2026-05-15T10:00:00Z");
      const next = computeNextResetAt("month", now);
      expect(next.getUTCMonth()).toBe(5); // June (0-indexed)
      expect(next.getUTCDate()).toBe(1);
      expect(next.getUTCHours()).toBe(0);
    });

    it("from Jan 31 → Feb 1", () => {
      const now = new Date("2026-01-31T15:00:00Z");
      const next = computeNextResetAt("month", now);
      expect(next.getUTCMonth()).toBe(1); // Feb
      expect(next.getUTCDate()).toBe(1);
    });

    it("from Dec 31 → Jan 1 next year", () => {
      const now = new Date("2026-12-31T23:59:00Z");
      const next = computeNextResetAt("month", now);
      expect(next.getUTCFullYear()).toBe(2027);
      expect(next.getUTCMonth()).toBe(0); // Jan
      expect(next.getUTCDate()).toBe(1);
    });
  });
});
