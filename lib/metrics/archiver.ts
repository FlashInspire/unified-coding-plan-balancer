/**
 * Daily archiver: deletes log shards older than LOG_RETENTION_DAYS and
 * monthly stat shards older than STAT_RETENTION_MONTHS.
 * (Down-sampling into archive/YYYY.sqlite is left as a TODO for v1.)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { env } from "@/lib/env";
import { listShards } from "@/lib/metrics/shardStore";

let timer: NodeJS.Timeout | null = null;

function purgeLogs(): number {
  const cutoff = new Date(Date.now() - env.LOG_RETENTION_DAYS * 86_400_000);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  let removed = 0;
  for (const key of listShards("log")) {
    if (key < cutoffKey) {
      // Inline literal path at every fs.* call site so Turbopack NFT can
      // statically scope tracing to <cwd>/data/ instead of the whole project.
      for (const suffix of ["", "-wal", "-shm"]) {
        try {
          if (
            fs.existsSync(
              path.join(process.cwd(), "data", "logs", `${key}.sqlite${suffix}`),
            )
          )
            fs.unlinkSync(
              path.join(process.cwd(), "data", "logs", `${key}.sqlite${suffix}`),
            );
        } catch {
          /* ignore */
        }
      }
      removed++;
    }
  }
  return removed;
}

function purgeStats(): number {
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - env.STAT_RETENTION_MONTHS);
  const cutoffKey = cutoff.toISOString().slice(0, 7);
  let removed = 0;
  for (const key of listShards("stat")) {
    if (key < cutoffKey) {
      // Inline literal path at every fs.* call site so Turbopack NFT can
      // statically scope tracing to <cwd>/data/ instead of the whole project.
      for (const suffix of ["", "-wal", "-shm"]) {
        try {
          if (
            fs.existsSync(
              path.join(process.cwd(), "data", "stats", `${key}.sqlite${suffix}`),
            )
          )
            fs.unlinkSync(
              path.join(process.cwd(), "data", "stats", `${key}.sqlite${suffix}`),
            );
        } catch {
          /* ignore */
        }
      }
      removed++;
    }
  }
  return removed;
}

export function archiveOnce(): { logs: number; stats: number } {
  return { logs: purgeLogs(), stats: purgeStats() };
}

export function startArchiver(): void {
  if (timer) return;
  // Run once at boot, then every 24h.
  setTimeout(() => {
    try {
      archiveOnce();
    } catch {
      /* ignore */
    }
  }, 60_000).unref?.();
  timer = setInterval(
    () => {
      try {
        archiveOnce();
      } catch {
        /* ignore */
      }
    },
    24 * 3600 * 1000,
  );
}

export function stopArchiver(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
