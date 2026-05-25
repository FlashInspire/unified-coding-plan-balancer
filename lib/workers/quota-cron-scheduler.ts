/**
 * Cron-based quota counter reset scheduler.
 *
 * Replaces the old setInterval-based reset logic with per-provider cron
 * expressions stored in the Provider table. A single 60-second tick evaluates
 * each provider's cron and resets the matching counter(s).
 */
import { Cron } from "croner";
import { prisma } from "@/lib/prisma";

let timer: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  const now = new Date();
  const providers = await prisma.provider.findMany({
    where: {
      OR: [
        { rollingQuotaCron: { not: null } },
        { weekQuotaCron: { not: null } },
        { monthQuotaCron: { not: null } },
      ],
    },
    select: {
      id: true,
      rollingQuotaCron: true,
      weekQuotaCron: true,
      monthQuotaCron: true,
    },
  });

  await Promise.all(
    providers.map((p) => {
      const updates: Record<string, unknown> = {};

      if (p.rollingQuotaCron && cronMatches(p.rollingQuotaCron, now)) {
        updates.rollingQuotaUsed = 0;
        updates.rollingQuotaResetAt = now;
      }
      if (p.weekQuotaCron && cronMatches(p.weekQuotaCron, now)) {
        updates.weekQuotaUsed = 0;
        updates.weekQuotaResetAt = now;
      }
      if (p.monthQuotaCron && cronMatches(p.monthQuotaCron, now)) {
        updates.monthQuotaUsed = 0;
        updates.monthQuotaResetAt = now;
      }

      if (Object.keys(updates).length === 0) return Promise.resolve();
      return prisma.provider.update({
        where: { id: p.id },
        data: updates,
      });
    }),
  );
}

function cronMatches(expr: string, date: Date): boolean {
  try {
    const job = new Cron(expr);
    return job.match(date);
  } catch {
    // Invalid cron expression — silently skip
    return false;
  }
}

export function startQuotaCronScheduler(): void {
  if (timer) return;
  // Tick every 60 seconds
  timer = setInterval(() => void tick(), 60_000);
  // Also run immediately on startup
  void tick();
}
