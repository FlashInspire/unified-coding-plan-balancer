#!/usr/bin/env tsx
/**
 * scripts/set-admin.ts
 *
 * Idempotent script: promote a user to admin, or create one if they don't exist.
 *
 * Usage:
 *   pnpm tsx scripts/set-admin.ts clarkson
 *   pnpm tsx scripts/set-admin.ts clarkson --password my-secret
 */
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// ── arg parse ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "--help") {
  console.log("Usage: pnpm tsx scripts/set-admin.ts <username> [--password <pw>]");
  process.exit(1);
}

const username = args[0];
let password: string | undefined;
for (let i = 1; i < args.length; i++) {
  if (args[i] === "--password" && args[i + 1]) {
    password = args[++i];
  }
}

// ── prisma init (same pattern as lib/prisma.ts) ─────────────────────────────
const dbUrl = process.env.DATABASE_URL ?? "file:./data/u22x.db";
const adapter = new PrismaBetterSqlite3({ url: dbUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Look for existing user
  const existing = await prisma.adminUser.findUnique({
    where: { username },
  });

  if (existing) {
    if (existing.role === "admin") {
      console.log(`✅ "${username}" is already an admin.`);
    } else {
      await prisma.adminUser.update({
        where: { id: existing.id },
        data: { role: "admin" },
      });
      console.log(`✅ Promoted "${username}" to admin.`);
    }
  } else {
    // Generate a random password if none provided
    const plain = password ?? crypto.randomUUID().slice(0, 16);
    const passwordHash = await bcrypt.hash(plain, 12);
    await prisma.adminUser.create({
      data: {
        username,
        passwordHash,
        role: "admin",
      },
    });
    console.log(`✅ Created admin user "${username}".`);
    if (!password) {
      console.log(`   Password: ${plain}`);
      console.log(`   (change it after first login)`);
    }
  }
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
