/**
 * Next.js instrumentation hook — runs once on server startup.
 * Seeds the admin user and boots background workers.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { adminUserRepo } = await import("@/lib/repositories/adminUserRepo");
  const { startWorkers } = await import("@/lib/workers/bootstrap");
  await adminUserRepo.ensureSeed();
  startWorkers();
}
