#!/usr/bin/env tsx
/**
 * scripts/flush-log-status.ts
 *
 * Set completed=true for every in-flight row in request_log.
 * Useful after a crash/restart where in-flight requests were never finalized.
 *
 * Usage:
 *   pnpm tsx scripts/flush-log-status.ts
 *   pnpm tsx scripts/flush-log-status.ts --dry-run
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const prisma = new PrismaClient();

async function main() {
  const pending = await prisma.requestLog.count({
    where: { completed: false },
  });

  console.log(
    `Found ${pending} in-flight row(s)${dryRun ? " [DRY RUN]" : ""}.`,
  );

  if (dryRun) {
    console.log(`  ${pending} row(s) would be updated.`);
  } else {
    const result = await prisma.requestLog.updateMany({
      where: { completed: false },
      data: { completed: true },
    });
    console.log(`\nDone. Total rows updated: ${result.count}`);
  }
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
