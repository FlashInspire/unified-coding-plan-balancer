/**
 * Starts background workers. Uses a global guard to avoid spawning
 * duplicates under Next.js hot reload.
 *
 * NOTE: All periodic tasks (flusher, aggregator, archiver, reset-scheduler)
 * are now triggered by GET /api/cron instead of setInterval.
 * This module only ensures boot-time initialization.
 */

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

  console.log(
    "[ucpb] Boot-time initialization done (periodic tasks via /api/cron).",
  );
}
