/**
 * Starts background workers. Uses a global guard to avoid spawning
 * duplicates under Next.js hot reload.
 *
 * NOTE: All periodic tasks (flusher, aggregator, archiver, reset-scheduler,
 * quota-compute) are now triggered by GET /api/cron instead of setInterval.
 * This module only ensures boot-time initialization.
 */
import { prisma } from "@/lib/prisma";
import { computeQuotaUsagePercent } from "@/lib/quota/computeUsagePercent";
import { quotaSnapshotRepo } from "@/lib/repositories/quotaSnapshotRepo";

// --- Quota Compute Worker ---
// Runs once at boot to populate initial snapshots.
export async function computeAllQuotaSnapshots(): Promise<void> {
  const providers = await prisma.provider.findMany();
  await Promise.all(
    providers.map((p) => {
      const usagePercent = computeQuotaUsagePercent({
        rollingQuota: p.rollingQuota,
        rollingQuotaUsed: p.rollingQuotaUsed,
        weekQuota: p.weekQuota,
        weekQuotaUsed: p.weekQuotaUsed,
        monthQuota: p.monthQuota,
        monthQuotaUsed: p.monthQuotaUsed,
      });
      return quotaSnapshotRepo.upsert(p.id, usagePercent);
    }),
  );
}

const globalForWorkers = globalThis as unknown as {
  __ucpb_workers_started?: boolean;
};

/**
 * @deprecated Periodic workers are now driven by GET /api/cron.
 * Kept for backward compatibility; does nothing if already started.
 */
export function startWorkers(): void {
  if (globalForWorkers.__ucpb_workers_started) return;
  globalForWorkers.__ucpb_workers_started = true;

  // Run initial quota compute snapshot once at boot.
  void computeAllQuotaSnapshots();

  console.log("[ucpb] Boot-time initialization done (periodic tasks via /api/cron).");
}
