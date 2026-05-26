/**
 * Starts all background workers. Uses a global guard to avoid spawning
 * duplicates under Next.js hot reload.
 */
import { prisma } from "@/lib/prisma";
import { startFlusher } from "@/lib/metrics/flusher";
import { startAggregator } from "@/lib/metrics/aggregator";
import { startArchiver } from "@/lib/metrics/archiver";
import { computeQuotaUsagePercent } from "@/lib/quota/computeUsagePercent";
import { quotaSnapshotRepo } from "@/lib/repositories/quotaSnapshotRepo";
import { startResetScheduler } from "@/lib/quota/reset-scheduler";

// --- Quota Compute Worker ---
// Every 60 s: derive usagePercent from local counter fields (no upstream calls).
// Semantics: choose the tightest quota dimension (minimum remaining amount).
function startQuotaComputeWorker(): void {
  async function computeAll(): Promise<void> {
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

  // Run immediately on startup, then every 60 s
  void computeAll();
  setInterval(() => void computeAll(), 60_000);
}

const globalForWorkers = globalThis as unknown as {
  __ucpb_workers_started?: boolean;
};

export function startWorkers(): void {
  if (globalForWorkers.__ucpb_workers_started) return;
  globalForWorkers.__ucpb_workers_started = true;

  startFlusher();
  startAggregator();
  startArchiver();
  startResetScheduler();
  startQuotaComputeWorker();

  console.log("[ucpb] Background workers started.");
}
