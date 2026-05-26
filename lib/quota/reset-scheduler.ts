/**
 * Timestamp-based quota counter reset scheduler.
 *
 * Each Provider stores *ResetAt timestamps that indicate when the next
 * reset should occur. A single 60-second interval checks if any
 * timestamp has been reached; when it has, the corresponding counter
 * is zeroed and the next reset timestamp is computed.
 *
 * Rolling resets snap to hours where (hour - offset) % 5 === 0.
 * Weekly resets fire at Monday 00:00.
 * Monthly resets fire at the 1st day 00:00.
 */
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Exported helpers (pure, testable)
// ---------------------------------------------------------------------------

export type ResetDimension = "rolling" | "week" | "month";

const ROLLING_INTERVAL_HOURS = 5;

/**
 * Compute the next reset timestamp for a given dimension.
 *
 * @param dimension  Which quota dimension
 * @param now        Current time (injectable for testing)
 * @param rollingHourOffset  0–23; rolling resets snap to hours ≡ offset (mod 5)
 */
export function computeNextResetAt(
  dimension: ResetDimension,
  now: Date,
  rollingHourOffset = 0,
): Date {
  switch (dimension) {
    case "rolling":
      return computeNextRollingReset(now, rollingHourOffset);
    case "week":
      return computeNextWeekReset(now);
    case "month":
      return computeNextMonthReset(now);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function computeNextRollingReset(now: Date, offset: number): Date {
  // Target: the next hour h where (h - offset) % 5 === 0.
  // Work entirely in UTC to avoid timezone issues.

  // Start from the beginning of the next hour after now.
  const utcMs = now.getTime();
  const msInHour = 3_600_000;
  // Floor to current hour, then add one full hour
  const nextHourMs = Math.floor(utcMs / msInHour) * msInHour + msInHour;

  // Scan forward hour by hour (at most 5 hours) until we hit a valid slot
  for (let i = 0; i <= ROLLING_INTERVAL_HOURS; i++) {
    const candidateMs = nextHourMs + i * msInHour;
    const h = new Date(candidateMs).getUTCHours();
    if (h % ROLLING_INTERVAL_HOURS === offset % ROLLING_INTERVAL_HOURS) {
      return new Date(candidateMs);
    }
  }

  // Fallback (should never happen): now + 5h
  return new Date(utcMs + ROLLING_INTERVAL_HOURS * msInHour);
}

function computeNextWeekReset(now: Date): Date {
  // Next Monday 00:00 UTC
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  if (dayOfWeek === 1 && now.getTime() <= d.getTime()) {
    // Exactly midnight Monday — this Monday is the target
    return d;
  }

  // Days until next Monday: if today is Monday (and past midnight), add 7
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + (dayOfWeek === 1 ? 7 : daysUntilMonday));
  return d;
}

function computeNextMonthReset(now: Date): Date {
  // Next 1st day of month 00:00 UTC
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);

  if (d.getUTCDate() === 1 && now.getTime() <= d.getTime()) {
    // Exactly midnight on the 1st — stay
    return d;
  }

  // Move to 1st of next month
  d.setUTCMonth(d.getUTCMonth() + 1, 1);
  return d;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

let timer: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  const now = new Date();
  const nowTime = now.getTime();

  const providers = await prisma.provider.findMany({
    where: { enabled: true },
    select: {
      id: true,
      rollingQuota: true,
      rollingQuotaUsed: true,
      rollingQuotaResetAt: true,
      rollingHourOffset: true,
      weekQuota: true,
      weekQuotaUsed: true,
      weekQuotaResetAt: true,
      monthQuota: true,
      monthQuotaUsed: true,
      monthQuotaResetAt: true,
    },
  });

  await Promise.all(
    providers.map((p) => {
      const updates: Record<string, unknown> = {};

      // Rolling — reset if past due, or backfill if resetAt is missing
      // quota = 0 or null means unlimited → skip scheduling
      if (p.rollingQuota != null && p.rollingQuota > 0) {
        if (
          p.rollingQuotaResetAt &&
          p.rollingQuotaResetAt.getTime() <= nowTime
        ) {
          updates.rollingQuotaUsed = 0;
          updates.rollingQuotaResetAt = computeNextResetAt(
            "rolling",
            now,
            p.rollingHourOffset,
          );
        } else if (!p.rollingQuotaResetAt) {
          updates.rollingQuotaResetAt = computeNextResetAt(
            "rolling",
            now,
            p.rollingHourOffset,
          );
        }
      }

      // Weekly — reset if past due, or backfill if resetAt is missing
      // quota = 0 or null means unlimited → skip scheduling
      if (p.weekQuota != null && p.weekQuota > 0) {
        if (p.weekQuotaResetAt && p.weekQuotaResetAt.getTime() <= nowTime) {
          updates.weekQuotaUsed = 0;
          updates.weekQuotaResetAt = computeNextResetAt("week", now);
        } else if (!p.weekQuotaResetAt) {
          updates.weekQuotaResetAt = computeNextResetAt("week", now);
        }
      }

      // Monthly — reset if past due, or backfill if resetAt is missing
      // quota = 0 or null means unlimited → skip scheduling
      if (p.monthQuota != null && p.monthQuota > 0) {
        if (p.monthQuotaResetAt && p.monthQuotaResetAt.getTime() <= nowTime) {
          updates.monthQuotaUsed = 0;
          updates.monthQuotaResetAt = computeNextResetAt("month", now);
        } else if (!p.monthQuotaResetAt) {
          updates.monthQuotaResetAt = computeNextResetAt("month", now);
        }
      }

      if (Object.keys(updates).length === 0) return Promise.resolve();
      return prisma.provider.update({
        where: { id: p.id },
        data: updates,
      });
    }),
  );
}

export function startResetScheduler(): void {
  if (timer) return;
  // Tick every 60 seconds
  timer = setInterval(() => void tick(), 60_000);
  // Also run immediately on startup
  void tick();
}
