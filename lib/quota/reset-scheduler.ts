/**
 * Timestamp-based quota counter reset scheduler.
 *
 * Each Provider stores *ResetAt timestamps that indicate when the next
 * reset should occur. A single 60-second interval checks if any
 * timestamp has been reached; when it has, the corresponding counter
 * is zeroed and the next reset timestamp is computed.
 *
 * Provider rolling resets fire every 5 hours, anchored to planStartTime.
 * User (AdminUser) rolling resets fire every 1 hour (hourly quota).
 * Monthly resets fire on the same day-of-month as planStartTime.
 * Weekly resets fire at Monday 00:00 UTC (unchanged).
 *
 * ApiKey / User natural calendar resets:
 * - Rolling: every N hours anchored to createdAt (1h for users, 5h for providers)
 * - Week: next natural Monday 00:00 UTC
 * - Month: next natural 1st of month 00:00 UTC
 */
import { prisma } from "@/lib/prisma";
import { resetQuotaRetries } from "@/lib/routing/selectCandidate";
import { userDimensionBuffer } from "@/lib/fee-pipeline/user-buffer";

// ---------------------------------------------------------------------------
// Exported helpers (pure, testable)
// ---------------------------------------------------------------------------

export type ResetDimension = "rolling" | "week" | "month";

const DEFAULT_ROLLING_INTERVAL_HOURS = 5;

/**
 * Compute the next reset timestamp for a given dimension.
 *
 * @param dimension     Which quota dimension
 * @param now           Current time (injectable for testing)
 * @param planStartTime  Provider's plan start anchor (required for rolling & month)
 * @param intervalHours Rolling interval in hours (default 5 for providers)
 */
export function computeNextResetAt(
  dimension: ResetDimension,
  now: Date,
  planStartTime: Date,
  intervalHours = DEFAULT_ROLLING_INTERVAL_HOURS,
): Date {
  switch (dimension) {
    case "rolling":
      return computeNextRollingReset(now, planStartTime, intervalHours);
    case "week":
      return computeNextWeekReset(now);
    case "month":
      return computeNextMonthReset(now, planStartTime);
  }
}

/**
 * Compute the next natural calendar reset for ApiKey / User.
 * - Rolling: every N hours anchored to createdAt (N=1 for users, N=5 for legacy)
 * - Week: next Monday 00:00 UTC
 * - Month: next 1st of month 00:00 UTC
 */
export function computeNextKeyResetAt(
  dimension: ResetDimension,
  now: Date,
  createdAt: Date,
  intervalHours = DEFAULT_ROLLING_INTERVAL_HOURS,
): Date {
  switch (dimension) {
    case "rolling":
      return computeNextRollingReset(now, createdAt, intervalHours);
    case "week":
      return computeNextNaturalWeekReset(now);
    case "month":
      return computeNextNaturalMonthReset(now);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function computeNextRollingReset(
  now: Date,
  planStartTime: Date,
  intervalHours: number,
): Date {
  const intervalMs = intervalHours * 3_600_000;
  const elapsed = now.getTime() - planStartTime.getTime();

  // If plan hasn't started yet, the first reset is at planStartTime
  if (elapsed < 0) return new Date(planStartTime);

  // How many full intervals have elapsed since planStartTime
  const intervalsElapsed = Math.floor(elapsed / intervalMs);

  // Next reset is at the start of the next interval
  return new Date(
    planStartTime.getTime() + (intervalsElapsed + 1) * intervalMs,
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

/** Next natural Monday 00:00 UTC. */
export function computeNextNaturalWeekReset(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  if (dayOfWeek === 1 && now.getTime() <= d.getTime()) {
    return d; // exactly midnight Monday
  }
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + (dayOfWeek === 1 ? 7 : daysUntilMonday));
  return d;
}

/** Next natural 1st of month 00:00 UTC. */
export function computeNextNaturalMonthReset(now: Date): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  // Try this month's 1st
  const candidate = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  if (candidate.getTime() > now.getTime()) return candidate;
  // Next month's 1st
  return new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
}

/** Next midnight UTC (daily reset). */
export function computeNextNaturalDayReset(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

// ---------------------------------------------------------------------------
// Scheduler — exported for cron endpoint
// ---------------------------------------------------------------------------

export interface ResetTickResult {
  providersReset: number;
  keysReset: number; // now counts user resets
}

/**
 * Run one tick of the reset scheduler.
 * Called by GET /api/cron. Returns counts of entities that were reset.
 */
export async function resetTick(): Promise<ResetTickResult> {
  const now = new Date();
  const nowTime = now.getTime();
  let providersReset = 0;
  let keysReset = 0;

  // ── Provider resets ──────────────────────────────────────────────

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
        providersReset++;
      }

      if (Object.keys(updates).length === 0) return Promise.resolve();
      return prisma.provider.update({
        where: { id: p.id },
        data: updates,
      });
    }),
  );

  // ── User (AdminUser) quota resets ──────────────────────────────
  // Users use 1-hour rolling interval (hourly quota).

  const USER_ROLLING_INTERVAL_HOURS = 1;

  const users = await prisma.adminUser.findMany({
    where: {},
    select: {
      id: true,
      createdAt: true,
      rollingQuota: true,
      weekQuota: true,
      monthQuota: true,
      rollingInputTokensUsed: true,
      rollingCachedReadTokensUsed: true,
      rollingOutputTokensUsed: true,
      weekInputTokensUsed: true,
      weekCachedReadTokensUsed: true,
      weekOutputTokensUsed: true,
      monthInputTokensUsed: true,
      monthCachedReadTokensUsed: true,
      monthOutputTokensUsed: true,
      rollingQuotaResetAt: true,
      weekQuotaResetAt: true,
      monthQuotaResetAt: true,
      quotaMultiplierInput: true,
      quotaMultiplierCachedRead: true,
      quotaMultiplierOutput: true,
    },
  });

  const DIMENSION_ZERO = {
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

  await Promise.all(
    users.map((u) => {
      const updates: Record<string, unknown> = {};
      let anyReset = false;

      if (u.rollingQuota != null && u.rollingQuota > 0) {
        if (
          u.rollingQuotaResetAt &&
          u.rollingQuotaResetAt.getTime() <= nowTime
        ) {
          Object.assign(updates, {
            rollingInputTokensUsed: 0,
            rollingCachedReadTokensUsed: 0,
            rollingOutputTokensUsed: 0,
          });
          updates.rollingQuotaResetAt = computeNextKeyResetAt(
            "rolling",
            now,
            u.createdAt,
            USER_ROLLING_INTERVAL_HOURS,
          );
          anyReset = true;
        } else if (!u.rollingQuotaResetAt) {
          updates.rollingQuotaResetAt = computeNextKeyResetAt(
            "rolling",
            now,
            u.createdAt,
            USER_ROLLING_INTERVAL_HOURS,
          );
        }
      }

      if (u.weekQuota != null && u.weekQuota > 0) {
        if (u.weekQuotaResetAt && u.weekQuotaResetAt.getTime() <= nowTime) {
          Object.assign(updates, {
            weekInputTokensUsed: 0,
            weekCachedReadTokensUsed: 0,
            weekOutputTokensUsed: 0,
          });
          updates.weekQuotaResetAt = computeNextKeyResetAt(
            "week",
            now,
            u.createdAt,
          );
          anyReset = true;
        } else if (!u.weekQuotaResetAt) {
          updates.weekQuotaResetAt = computeNextKeyResetAt(
            "week",
            now,
            u.createdAt,
          );
        }
      }

      if (u.monthQuota != null && u.monthQuota > 0) {
        if (u.monthQuotaResetAt && u.monthQuotaResetAt.getTime() <= nowTime) {
          Object.assign(updates, {
            monthInputTokensUsed: 0,
            monthCachedReadTokensUsed: 0,
            monthOutputTokensUsed: 0,
          });
          updates.monthQuotaResetAt = computeNextKeyResetAt(
            "month",
            now,
            u.createdAt,
          );
          anyReset = true;
        } else if (!u.monthQuotaResetAt) {
          updates.monthQuotaResetAt = computeNextKeyResetAt(
            "month",
            now,
            u.createdAt,
          );
        }
      }

      if (anyReset) {
        keysReset++;
        // Clear quota cache so in-flight checks pick up the reset.
        userDimensionBuffer.clearQuotaCache(u.id);
      }

      if (Object.keys(updates).length === 0) return Promise.resolve();
      return prisma.adminUser.update({
        where: { id: u.id },
        data: updates,
      });
    }),
  );

  // Refresh all user quota caches after potential resets.
  for (const u of users) {
    userDimensionBuffer.setQuotaCache(u.id, {
      rollingQuota: u.rollingQuota,
      weekQuota: u.weekQuota,
      monthQuota: u.monthQuota,
      rollingInputTokensUsed: u.rollingInputTokensUsed,
      rollingCachedReadTokensUsed: u.rollingCachedReadTokensUsed,
      rollingOutputTokensUsed: u.rollingOutputTokensUsed,
      weekInputTokensUsed: u.weekInputTokensUsed,
      weekCachedReadTokensUsed: u.weekCachedReadTokensUsed,
      weekOutputTokensUsed: u.weekOutputTokensUsed,
      monthInputTokensUsed: u.monthInputTokensUsed,
      monthCachedReadTokensUsed: u.monthCachedReadTokensUsed,
      monthOutputTokensUsed: u.monthOutputTokensUsed,
      quotaMultiplierInput: u.quotaMultiplierInput,
      quotaMultiplierCachedRead: u.quotaMultiplierCachedRead,
      quotaMultiplierOutput: u.quotaMultiplierOutput,
    });
  }

  // ── API Key (ApiKey) quota resets ──────────────────────────────
  // API keys reset at the same cadence as users (1h rolling, weekly Monday, monthly 1st).

  const apiKeys = await prisma.apiKey.findMany({
    where: {},
    select: {
      id: true,
      createdAt: true,
      rollingQuotaResetAt: true,
      weekQuotaResetAt: true,
      monthQuotaResetAt: true,
    },
  });

  await Promise.all(
    apiKeys.map((k) => {
      const updates: Record<string, unknown> = {};
      let anyReset = false;

      // Rolling (1h)
      if (k.rollingQuotaResetAt && k.rollingQuotaResetAt.getTime() <= nowTime) {
        Object.assign(updates, {
          rollingInputTokensUsed: 0,
          rollingCachedReadTokensUsed: 0,
          rollingOutputTokensUsed: 0,
        });
        updates.rollingQuotaResetAt = computeNextKeyResetAt(
          "rolling",
          now,
          k.createdAt,
          USER_ROLLING_INTERVAL_HOURS,
        );
        anyReset = true;
      } else if (!k.rollingQuotaResetAt) {
        updates.rollingQuotaResetAt = computeNextKeyResetAt(
          "rolling",
          now,
          k.createdAt,
          USER_ROLLING_INTERVAL_HOURS,
        );
      }

      // Weekly
      if (k.weekQuotaResetAt && k.weekQuotaResetAt.getTime() <= nowTime) {
        Object.assign(updates, {
          weekInputTokensUsed: 0,
          weekCachedReadTokensUsed: 0,
          weekOutputTokensUsed: 0,
        });
        updates.weekQuotaResetAt = computeNextKeyResetAt(
          "week",
          now,
          k.createdAt,
        );
        anyReset = true;
      } else if (!k.weekQuotaResetAt) {
        updates.weekQuotaResetAt = computeNextKeyResetAt(
          "week",
          now,
          k.createdAt,
        );
      }

      // Monthly
      if (k.monthQuotaResetAt && k.monthQuotaResetAt.getTime() <= nowTime) {
        Object.assign(updates, {
          monthInputTokensUsed: 0,
          monthCachedReadTokensUsed: 0,
          monthOutputTokensUsed: 0,
        });
        updates.monthQuotaResetAt = computeNextKeyResetAt(
          "month",
          now,
          k.createdAt,
        );
        anyReset = true;
      } else if (!k.monthQuotaResetAt) {
        updates.monthQuotaResetAt = computeNextKeyResetAt(
          "month",
          now,
          k.createdAt,
        );
      }

      if (anyReset) keysReset++;

      if (Object.keys(updates).length === 0) return Promise.resolve();
      return prisma.apiKey.update({
        where: { id: k.id },
        data: updates,
      });
    }),
  );

  return { providersReset, keysReset };
}
