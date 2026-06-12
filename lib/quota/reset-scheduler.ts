/**
 * Timestamp-based quota counter reset scheduler.
 *
 * Each Provider stores *ResetAt timestamps that indicate when the next
 * reset should occur. A single 60-second interval checks if any
 * timestamp has been reached; when it has, the corresponding counter
 * is zeroed and the next reset timestamp is computed.
 *
 * Rolling resets fire every 5 hours, anchored to the provider's
 * planStartTime (falls back to createdAt when null).
 * Monthly resets fire on the same day-of-month as planStartTime.
 * Weekly resets fire at Monday 00:00 UTC (unchanged).
 */
import { prisma } from "@/lib/prisma";
import { resetQuotaRetries } from "@/lib/routing/selectCandidate";

// ---------------------------------------------------------------------------
// Exported helpers (pure, testable)
// ---------------------------------------------------------------------------

export type ResetDimension = "rolling" | "week" | "month";

const ROLLING_INTERVAL_HOURS = 5;
const ROLLING_INTERVAL_MS = ROLLING_INTERVAL_HOURS * 3_600_000;

/**
 * Compute the next reset timestamp for a given dimension.
 *
 * @param dimension     Which quota dimension
 * @param now           Current time (injectable for testing)
 * @param planStartTime  Provider's plan start anchor (required for rolling & month)
 */
export function computeNextResetAt(
  dimension: ResetDimension,
  now: Date,
  planStartTime: Date,
): Date {
  switch (dimension) {
    case "rolling":
      return computeNextRollingReset(now, planStartTime);
    case "week":
      return computeNextWeekReset(now);
    case "month":
      return computeNextMonthReset(now, planStartTime);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function computeNextRollingReset(now: Date, planStartTime: Date): Date {
  const elapsed = now.getTime() - planStartTime.getTime();

  // If plan hasn't started yet, the first reset is at planStartTime
  if (elapsed < 0) return new Date(planStartTime);

  // How many full 5-hour intervals have elapsed since planStartTime
  const intervalsElapsed = Math.floor(elapsed / ROLLING_INTERVAL_MS);

  // Next reset is at the start of the next interval
  return new Date(
    planStartTime.getTime() + (intervalsElapsed + 1) * ROLLING_INTERVAL_MS,
  );
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

function lastDayOfMonth(year: number, month: number): number {
  // month is 0-indexed; day 0 of next month = last day of this month
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function computeNextMonthReset(now: Date, planStartTime: Date): Date {
  const targetDay = planStartTime.getUTCDate();
  const h = planStartTime.getUTCHours();
  const m = planStartTime.getUTCMinutes();
  const s = planStartTime.getUTCSeconds();

  // Try this month first
  const thisMonthMax = lastDayOfMonth(now.getUTCFullYear(), now.getUTCMonth());
  const thisMonthDay = Math.min(targetDay, thisMonthMax);
  const candidate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), thisMonthDay, h, m, s, 0),
  );
  if (candidate.getTime() > now.getTime()) return candidate;

  // Next month
  const nextMonth = now.getUTCMonth() + 1;
  const nextYear =
    nextMonth > 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const nextMonthIdx = nextMonth % 12;
  const nextMonthMax = lastDayOfMonth(nextYear, nextMonthIdx);
  const nextMonthDay = Math.min(targetDay, nextMonthMax);
  return new Date(Date.UTC(nextYear, nextMonthIdx, nextMonthDay, h, m, s, 0));
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
      planStartTime: true,
      createdAt: true,
      weekQuota: true,
      weekQuotaUsed: true,
      weekQuotaResetAt: true,
      monthQuota: true,
      monthQuotaUsed: true,
      monthQuotaResetAt: true,
      usageMode: true,
      rollingCacheInputTokensUsed: true,
      rollingOutputTokensUsed: true,
      weekCacheInputTokensUsed: true,
      weekOutputTokensUsed: true,
      monthCacheInputTokensUsed: true,
      monthOutputTokensUsed: true,
    },
  });

  await Promise.all(
    providers.map((p) => {
      const updates: Record<string, unknown> = {};
      let anyReset = false;
      const anchor = p.planStartTime ?? p.createdAt; // plan start or creation time

      // Rolling — reset if past due, or backfill if resetAt is missing
      // quota = 0 or null means unlimited → skip scheduling
      if (p.rollingQuota != null && p.rollingQuota > 0) {
        if (
          p.rollingQuotaResetAt &&
          p.rollingQuotaResetAt.getTime() <= nowTime
        ) {
          updates.rollingQuotaUsed = 0;
          updates.rollingCacheInputTokensUsed = 0;
          updates.rollingOutputTokensUsed = 0;
          updates.rollingQuotaResetAt = computeNextResetAt(
            "rolling",
            now,
            anchor,
          );
          anyReset = true;
        } else if (!p.rollingQuotaResetAt) {
          updates.rollingQuotaResetAt = computeNextResetAt(
            "rolling",
            now,
            anchor,
          );
        }
      }

      // Weekly — reset if past due, or backfill if resetAt is missing
      // quota = 0 or null means unlimited → skip scheduling
      if (p.weekQuota != null && p.weekQuota > 0) {
        if (p.weekQuotaResetAt && p.weekQuotaResetAt.getTime() <= nowTime) {
          updates.weekQuotaUsed = 0;
          updates.weekCacheInputTokensUsed = 0;
          updates.weekOutputTokensUsed = 0;
          updates.weekQuotaResetAt = computeNextResetAt("week", now, anchor);
          anyReset = true;
        } else if (!p.weekQuotaResetAt) {
          updates.weekQuotaResetAt = computeNextResetAt("week", now, anchor);
        }
      }

      // Monthly — reset if past due, or backfill if resetAt is missing
      // quota = 0 or null means unlimited → skip scheduling
      if (p.monthQuota != null && p.monthQuota > 0) {
        if (p.monthQuotaResetAt && p.monthQuotaResetAt.getTime() <= nowTime) {
          updates.monthQuotaUsed = 0;
          updates.monthCacheInputTokensUsed = 0;
          updates.monthOutputTokensUsed = 0;
          updates.monthQuotaResetAt = computeNextResetAt("month", now, anchor);
          anyReset = true;
        } else if (!p.monthQuotaResetAt) {
          updates.monthQuotaResetAt = computeNextResetAt("month", now, anchor);
        }
      }

      // When any quota dimension resets, also clear the "Running out" status
      if (anyReset) {
        updates.quotaRunningOut = false;
        resetQuotaRetries(p.id);
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
