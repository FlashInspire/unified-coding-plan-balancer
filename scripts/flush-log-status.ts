#!/usr/bin/env tsx
/**
 * scripts/flush-log-status.ts
 *
 * Set completed=1 for every row in request_log across all log shards.
 * Useful after a crash/restart where in-flight requests were never finalized.
 *
 * Usage:
 *   pnpm tsx scripts/flush-log-status.ts
 *   pnpm tsx scripts/flush-log-status.ts --dry-run
 */
import * as fs from "node:fs";
import * as path from "node:path";
import Database from "better-sqlite3";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const logsDir = path.join(process.cwd(), "data", "logs");

if (!fs.existsSync(logsDir)) {
  console.error(`Logs directory not found: ${logsDir}`);
  process.exit(1);
}

const shards = fs
  .readdirSync(logsDir)
  .filter((f) => f.endsWith(".sqlite"))
  .sort();

if (shards.length === 0) {
  console.log("No log shards found.");
  process.exit(0);
}

console.log(`Found ${shards.length} shard(s)${dryRun ? " [DRY RUN]" : ""}:`);

let totalUpdated = 0;

for (const shard of shards) {
  const filePath = path.join(logsDir, shard);
  const db = new Database(filePath);

  try {
    db.pragma("journal_mode = WAL");

    // Check whether this shard has the completed column (older shards may not).
    const cols = (
      db.prepare("PRAGMA table_info(request_log)").all() as Array<{
        name: string;
      }>
    ).map((c) => c.name);

    if (!cols.includes("completed")) {
      console.log(`  ${shard}: skipped (no 'completed' column)`);
      continue;
    }

    const pending = db
      .prepare("SELECT COUNT(*) as n FROM request_log WHERE completed = 0")
      .get() as { n: number };

    if (dryRun) {
      console.log(`  ${shard}: ${pending.n} row(s) would be updated`);
    } else {
      const result = db
        .prepare("UPDATE request_log SET completed = 1 WHERE completed = 0")
        .run();
      console.log(`  ${shard}: updated ${result.changes} row(s)`);
      totalUpdated += result.changes;
    }
  } finally {
    db.close();
  }
}

if (!dryRun) {
  console.log(`\nDone. Total rows updated: ${totalUpdated}`);
}
