/**
 * Shared bootstrap helper. Starts background workers + seeds admin once.
 * Safe to call from any route handler (uses globalThis guard).
 */
import { startWorkers } from "@/lib/workers/bootstrap";
import { adminUserRepo } from "@/lib/repositories/adminUserRepo";

const globalForBoot = globalThis as unknown as {
  __ucpb_bootstrapped?: boolean;
};

export async function ensureBoot(): Promise<void> {
  if (globalForBoot.__ucpb_bootstrapped) return;
  globalForBoot.__ucpb_bootstrapped = true;
  await adminUserRepo.ensureSeed();
  startWorkers();
}
