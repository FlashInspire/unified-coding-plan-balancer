import { describe, expect, it } from "vitest";
import { computeNextResetAt } from "@/lib/quota/reset-scheduler";

describe("computeNextResetAt", () => {
  // -----------------------------------------------------------------------
  // Rolling — anchored to planStartTime
  // -----------------------------------------------------------------------
  describe("rolling (planStartTime at 03:27)", () => {
    // planStartTime = 2026-01-15 03:27:00Z → reset slots: 03:27, 08:27, 13:27, 18:27, 23:27 …
    const planStart = new Date("2026-01-15T03:27:00Z");

    it("from before the first slot → returns first slot", () => {
      const now = new Date("2026-01-15T01:00:00Z");
      const next = computeNextResetAt("rolling", now, planStart);
      expect(next.toISOString()).toBe("2026-01-15T03:27:00.000Z");
    });

    it("snaps to the next 5-hour interval from planStartTime", () => {
      // 05:00 on the same day → next slot is 08:27
      const now = new Date("2026-01-15T05:00:00Z");
      const next = computeNextResetAt("rolling", now, planStart);
      // elapsed = 1h33m → intervalsElapsed = 0 → next = planStart + 5h = 08:27
      expect(next.toISOString()).toBe("2026-01-15T08:27:00.000Z");
    });

    it("wraps across days correctly", () => {
      // A time just after 23:27 → next is 03:27 next day
      const planStart2 = new Date("2026-05-26T23:27:00Z");
      const now = new Date("2026-05-26T23:30:00Z");
      const next = computeNextResetAt("rolling", now, planStart2);
      expect(next.toISOString()).toBe("2026-05-27T04:27:00.000Z"); // 23:27 + 5h = 04:27 next day
    });

    it("when exactly at a boundary, advances to the next slot", () => {
      const now = new Date("2026-01-15T08:27:00Z");
      const next = computeNextResetAt("rolling", now, planStart);
      expect(next.toISOString()).toBe("2026-01-15T13:27:00.000Z");
    });
  });

  describe("rolling (planStartTime at 00:00)", () => {
    const planStart = new Date("2026-01-01T00:00:00Z");
    // Slots: 00:00, 05:00, 10:00, 15:00, 20:00

    it("03:15 → next is 05:00", () => {
      const now = new Date("2026-05-26T03:15:00Z");
      const next = computeNextResetAt("rolling", now, planStart);
      expect(next.getUTCHours()).toBe(5);
      expect(next.getUTCMinutes()).toBe(0);
    });

    it("after multiple slots same day → next correct slot", () => {
      // 22:30 on day 1 → intervalsElapsed = 4 (slots: 00, 05, 10, 15, 20)
      // next = planStart + 25h = Jan 2 01:00
      const now = new Date("2026-01-01T22:30:00Z");
      const next = computeNextResetAt("rolling", now, planStart);
      expect(next.toISOString()).toBe("2026-01-02T01:00:00.000Z");
    });
  });

  // -----------------------------------------------------------------------
  // Weekly
  // -----------------------------------------------------------------------
  describe("week", () => {
    const planStart = new Date("2026-01-01T00:00:00Z");

    it("from Wednesday → next Monday", () => {
      // 2026-05-27 is Wednesday
      const now = new Date("2026-05-27T12:00:00Z");
      const next = computeNextResetAt("week", now, planStart);
      expect(next.getUTCDay()).toBe(1); // Monday
      expect(next.getUTCHours()).toBe(0);
      expect(next.getUTCDate()).toBe(1); // June 1
    });

    it("from Monday past midnight → next Monday", () => {
      // 2026-05-25 is Monday, 14:00
      const now = new Date("2026-05-25T14:00:00Z");
      const next = computeNextResetAt("week", now, planStart);
      expect(next.getUTCDay()).toBe(1);
      expect(next.getUTCDate()).toBe(1); // June 1
    });

    it("from Sunday → next day (Monday)", () => {
      // 2026-05-31 is Sunday
      const now = new Date("2026-05-31T20:00:00Z");
      const next = computeNextResetAt("week", now, planStart);
      expect(next.getUTCDay()).toBe(1);
      expect(next.getUTCDate()).toBe(1); // June 1
    });
  });

  // -----------------------------------------------------------------------
  // Monthly — anchored to planStartTime day-of-month
  // -----------------------------------------------------------------------
  describe("month (planStartTime on 15th)", () => {
    // Resets on the 15th of each month, at 03:27
    const planStart = new Date("2026-01-15T03:27:00Z");

    it("before the 15th → same month's 15th", () => {
      const now = new Date("2026-05-10T10:00:00Z");
      const next = computeNextResetAt("month", now, planStart);
      expect(next.getUTCMonth()).toBe(4); // May
      expect(next.getUTCDate()).toBe(15);
      expect(next.getUTCHours()).toBe(3);
      expect(next.getUTCMinutes()).toBe(27);
    });

    it("after the 15th → next month's 15th", () => {
      const now = new Date("2026-05-20T10:00:00Z");
      const next = computeNextResetAt("month", now, planStart);
      expect(next.getUTCMonth()).toBe(5); // June
      expect(next.getUTCDate()).toBe(15);
    });

    it("exactly at reset time → advances to next month", () => {
      const now = new Date("2026-05-15T03:27:00Z");
      const next = computeNextResetAt("month", now, planStart);
      expect(next.getUTCMonth()).toBe(5); // June
      expect(next.getUTCDate()).toBe(15);
    });

    it("handles day 31 in short months (clamped)", () => {
      // planStartTime on 31st → in Feb, resets on 28th (or 29th in leap year)
      const planStart31 = new Date("2026-01-31T12:00:00Z");
      const now = new Date("2026-02-10T10:00:00Z");
      const next = computeNextResetAt("month", now, planStart31);
      expect(next.getUTCMonth()).toBe(1); // Feb
      expect(next.getUTCDate()).toBe(28); // clamped to 28
    });

    it("Dec → Jan next year", () => {
      const now = new Date("2026-12-20T10:00:00Z");
      const next = computeNextResetAt("month", now, planStart);
      expect(next.getUTCFullYear()).toBe(2027);
      expect(next.getUTCMonth()).toBe(0); // Jan
      expect(next.getUTCDate()).toBe(15);
    });
  });

  describe("month (planStartTime on 1st)", () => {
    // Traditional 1st-of-month behavior preserved
    const planStart = new Date("2026-01-01T00:00:00Z");

    it("from mid-month → 1st of next month", () => {
      const now = new Date("2026-05-15T10:00:00Z");
      const next = computeNextResetAt("month", now, planStart);
      expect(next.getUTCMonth()).toBe(5); // June
      expect(next.getUTCDate()).toBe(1);
    });

    it("from Jan 31 → Feb 1", () => {
      const now = new Date("2026-01-31T15:00:00Z");
      const next = computeNextResetAt("month", now, planStart);
      expect(next.getUTCMonth()).toBe(1); // Feb
      expect(next.getUTCDate()).toBe(1);
    });
  });
});
