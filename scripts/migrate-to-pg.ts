#!/usr/bin/env tsx
/**
 * scripts/migrate-to-pg.ts
 *
 * One-time migration script: reads config data from SQLite and writes to
 * PostgreSQL. Handles schema creation via `prisma db push`.
 *
 * Usage:
 *   export DATABASE_URL="postgresql://user:pass@localhost:5432/ucpb"
 *   pnpm tsx scripts/migrate-to-pg.ts [--sqlite-path ./data/config.sqlite]
 *
 * Logs (request_log, usage_minute, aggregate_report) are NOT migrated.
 */
import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";

// ── Arg parse ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let sqlitePath = path.join(process.cwd(), "data", "config.sqlite");
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--sqlite-path" && args[i + 1]) {
    sqlitePath = args[++i];
  }
  if (args[i] === "--help") {
    console.log(
      "Usage: pnpm tsx scripts/migrate-to-pg.ts [--sqlite-path <path>]",
    );
    console.log("\nEnvironment:");
    console.log("  DATABASE_URL  PostgreSQL connection string (required)");
    process.exit(0);
  }
}

// ── Validate ───────────────────────────────────────────────────────────────
const pgUrl = process.env.DATABASE_URL;
if (!pgUrl || !pgUrl.startsWith("postgresql://")) {
  console.error("❌ DATABASE_URL must be a postgresql:// URL");
  console.error("   Example: postgresql://user:pass@localhost:5432/ucpb");
  process.exit(1);
}

if (!fs.existsSync(sqlitePath)) {
  console.error(`❌ SQLite file not found: ${sqlitePath}`);
  process.exit(1);
}

console.log("╔══════════════════════════════════════════════╗");
console.log("║   SQLite → PostgreSQL Migration              ║");
console.log("╚══════════════════════════════════════════════╝");
console.log(`\n  SQLite source: ${sqlitePath}`);
console.log(`  PostgreSQL:    ${pgUrl.replace(/:[^:@]+@/, ":***@")}\n`);

// ── Step 1: Create PG schema via prisma db push ────────────────────────────
console.log("📦 Step 1: Creating PostgreSQL schema...");
try {
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: pgUrl },
  });
  console.log("✅ Schema created.\n");
} catch {
  console.error("❌ prisma db push failed. Check your DATABASE_URL.");
  process.exit(1);
}

// ── Step 2: Read config data from SQLite ───────────────────────────────────
console.log("📖 Step 2: Reading config data from SQLite...");
const sqlite = new Database(sqlitePath, { readonly: true });

function readTable(name: string): Record<string, unknown>[] {
  try {
    return sqlite.prepare(`SELECT * FROM "${name}"`).all() as Record<
      string,
      unknown
    >[];
  } catch {
    return [];
  }
}

// Read in FK-dependency order
const tables = [
  "AdminUser",
  "UserPreference",
  "Model",
  "Provider",
  "ProviderModel",
  "ApiKey",
  "StickyRoute",
  "SystemSetting",
] as const;

const tableData = new Map<string, Record<string, unknown>[]>();
for (const table of tables) {
  const rows = readTable(table);
  tableData.set(table, rows);
  console.log(`  ${table}: ${rows.length} row(s)`);
}
sqlite.close();

// ── Step 3: Insert into PostgreSQL via Prisma ─────────────────────────────
console.log("\n📥 Step 3: Inserting data into PostgreSQL...");
const prisma = new PrismaClient();

// Helper: convert SQLite boolean (0/1) to JS boolean
function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v === "true" || v === "1";
  return false;
}

// Helper: convert SQLite datetime string to JS Date
function toDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// Helper: parse JSON string
function toJson(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}

const counts: Record<string, number> = {};

async function migrateAdminUsers(): Promise<void> {
  const rows = tableData.get("AdminUser") ?? [];
  for (const r of rows) {
    await prisma.adminUser.upsert({
      where: { id: String(r.id) },
      create: {
        id: String(r.id),
        username: String(r.username),
        passwordHash: String(r.passwordHash),
        role: String(r.role ?? "user"),
        email: r.email != null ? String(r.email) : null,
        displayName: r.displayName != null ? String(r.displayName) : null,
        avatarUrl: r.avatarUrl != null ? String(r.avatarUrl) : null,
        mustChangePassword: toBool(r.mustChangePassword),
        lastSignInAt: toDate(r.lastSignInAt),
        createdAt: toDate(r.createdAt) ?? new Date(),
        rollingQuota: r.rollingQuota != null ? Number(r.rollingQuota) : null,
        weekQuota: r.weekQuota != null ? Number(r.weekQuota) : null,
        monthQuota: r.monthQuota != null ? Number(r.monthQuota) : null,
        rollingInputTokensUsed: Number(r.rollingInputTokensUsed ?? 0),
        rollingCachedReadTokensUsed: Number(r.rollingCachedReadTokensUsed ?? 0),
        rollingOutputTokensUsed: Number(r.rollingOutputTokensUsed ?? 0),
        weekInputTokensUsed: Number(r.weekInputTokensUsed ?? 0),
        weekCachedReadTokensUsed: Number(r.weekCachedReadTokensUsed ?? 0),
        weekOutputTokensUsed: Number(r.weekOutputTokensUsed ?? 0),
        monthInputTokensUsed: Number(r.monthInputTokensUsed ?? 0),
        monthCachedReadTokensUsed: Number(r.monthCachedReadTokensUsed ?? 0),
        monthOutputTokensUsed: Number(r.monthOutputTokensUsed ?? 0),
        rollingQuotaResetAt: toDate(r.rollingQuotaResetAt),
        weekQuotaResetAt: toDate(r.weekQuotaResetAt),
        monthQuotaResetAt: toDate(r.monthQuotaResetAt),
        quotaMultiplierInput: Number(r.quotaMultiplierInput ?? 1.0),
        quotaMultiplierCachedRead: Number(r.quotaMultiplierCachedRead ?? 0.1),
        quotaMultiplierOutput: Number(r.quotaMultiplierOutput ?? 4.0),
      },
      update: {}, // skip if exists
    });
  }
  counts.AdminUser = rows.length;
}

async function migrateUserPreferences(): Promise<void> {
  const rows = tableData.get("UserPreference") ?? [];
  for (const r of rows) {
    await prisma.userPreference.upsert({
      where: { userId: String(r.userId) },
      create: {
        userId: String(r.userId),
        language: String(r.language ?? "en"),
        theme: String(r.theme ?? "system"),
        createdAt: toDate(r.createdAt) ?? new Date(),
        updatedAt: toDate(r.updatedAt) ?? new Date(),
      },
      update: {},
    });
  }
  counts.UserPreference = rows.length;
}

async function migrateModels(): Promise<void> {
  const rows = tableData.get("Model") ?? [];
  for (const r of rows) {
    await prisma.model.upsert({
      where: { id: String(r.id) },
      create: {
        id: String(r.id),
        displayName: String(r.displayName),
        contextLength: Number(r.contextLength),
        maxTokens: Number(r.maxTokens),
        temperature: r.temperature != null ? Number(r.temperature) : null,
        topP: r.topP != null ? Number(r.topP) : null,
        topK: r.topK != null ? Number(r.topK) : null,
        minP: r.minP != null ? Number(r.minP) : null,
        frequencyPenalty:
          r.frequencyPenalty != null ? Number(r.frequencyPenalty) : null,
        presencePenalty:
          r.presencePenalty != null ? Number(r.presencePenalty) : null,
        repetitionPenalty:
          r.repetitionPenalty != null ? Number(r.repetitionPenalty) : null,
        reasoningEffort:
          r.reasoningEffort != null ? String(r.reasoningEffort) : null,
        includeReasoningInRequest: toBool(r.includeReasoningInRequest),
        vision: toBool(r.vision),
        enableThinking:
          r.enableThinking != null ? toBool(r.enableThinking) : undefined,
        thinkingBudget:
          r.thinkingBudget != null ? Number(r.thinkingBudget) : undefined,
        enabled: toBool(r.enabled ?? true),
        createdAt: toDate(r.createdAt) ?? new Date(),
        updatedAt: toDate(r.updatedAt) ?? new Date(),
      },
      update: {},
    });
  }
  counts.Model = rows.length;
}

async function migrateProviders(): Promise<void> {
  const rows = tableData.get("Provider") ?? [];
  for (const r of rows) {
    await prisma.provider.upsert({
      where: { id: String(r.id) },
      create: {
        id: String(r.id),
        name: String(r.name),
        baseUrlOpenai: r.baseUrlOpenai != null ? String(r.baseUrlOpenai) : null,
        apiKeyOpenai: r.apiKeyOpenai != null ? String(r.apiKeyOpenai) : null,
        baseUrlAnthropic:
          r.baseUrlAnthropic != null ? String(r.baseUrlAnthropic) : null,
        apiKeyAnthropic:
          r.apiKeyAnthropic != null ? String(r.apiKeyAnthropic) : null,
        headersTemplate: String(r.headersTemplate ?? "{}"),
        rollingQuota: r.rollingQuota != null ? Number(r.rollingQuota) : null,
        weekQuota: r.weekQuota != null ? Number(r.weekQuota) : null,
        monthQuota: r.monthQuota != null ? Number(r.monthQuota) : null,
        rollingQuotaUsed: Number(r.rollingQuotaUsed ?? 0),
        weekQuotaUsed: Number(r.weekQuotaUsed ?? 0),
        monthQuotaUsed: Number(r.monthQuotaUsed ?? 0),
        rollingQuotaResetAt: toDate(r.rollingQuotaResetAt),
        weekQuotaResetAt: toDate(r.weekQuotaResetAt),
        monthQuotaResetAt: toDate(r.monthQuotaResetAt),
        planStartTime: toDate(r.planStartTime),
        usageMode: String(r.usageMode ?? "request"),
        rollingCacheInputTokensUsed: Number(r.rollingCacheInputTokensUsed ?? 0),
        rollingOutputTokensUsed: Number(r.rollingOutputTokensUsed ?? 0),
        weekCacheInputTokensUsed: Number(r.weekCacheInputTokensUsed ?? 0),
        weekOutputTokensUsed: Number(r.weekOutputTokensUsed ?? 0),
        monthCacheInputTokensUsed: Number(r.monthCacheInputTokensUsed ?? 0),
        monthOutputTokensUsed: Number(r.monthOutputTokensUsed ?? 0),
        enabled: toBool(r.enabled ?? true),
        quotaRunningOut: toBool(r.quotaRunningOut),
        createdAt: toDate(r.createdAt) ?? new Date(),
        updatedAt: toDate(r.updatedAt) ?? new Date(),
      },
      update: {},
    });
  }
  counts.Provider = rows.length;
}

async function migrateProviderModels(): Promise<void> {
  const rows = tableData.get("ProviderModel") ?? [];
  for (const r of rows) {
    await prisma.providerModel.upsert({
      where: { id: String(r.id) },
      create: {
        id: String(r.id),
        modelId: String(r.modelId),
        providerId: String(r.providerId),
        realModelId: r.realModelId != null ? String(r.realModelId) : null,
        contextLengthOverride:
          r.contextLengthOverride != null
            ? Number(r.contextLengthOverride)
            : null,
        maxTokensOverride:
          r.maxTokensOverride != null ? Number(r.maxTokensOverride) : null,
        temperatureOverride:
          r.temperatureOverride != null ? Number(r.temperatureOverride) : null,
        topPOverride: r.topPOverride != null ? Number(r.topPOverride) : null,
        topKOverride: r.topKOverride != null ? Number(r.topKOverride) : null,
        reasoningEffortOverride:
          r.reasoningEffortOverride != null
            ? String(r.reasoningEffortOverride)
            : null,
        includeReasoningInRequestOverride:
          r.includeReasoningInRequestOverride != null
            ? toBool(r.includeReasoningInRequestOverride)
            : null,
        weight: Number(r.weight ?? 1),
        apiStyle: String(r.apiStyle ?? "auto"),
        feeRateInput: Number(r.feeRateInput ?? 1.0),
        feeRateCachedInput: Number(r.feeRateCachedInput ?? 0.1),
        feeRateOutput: Number(r.feeRateOutput ?? 4.0),
        enabled: toBool(r.enabled ?? true),
        createdAt: toDate(r.createdAt) ?? new Date(),
        updatedAt: toDate(r.updatedAt) ?? new Date(),
      },
      update: {},
    });
  }
  counts.ProviderModel = rows.length;
}

async function migrateApiKeys(): Promise<void> {
  const rows = tableData.get("ApiKey") ?? [];
  for (const r of rows) {
    await prisma.apiKey.upsert({
      where: { id: String(r.id) },
      create: {
        id: String(r.id),
        keyHash: String(r.keyHash),
        name: String(r.name),
        ownerId: r.ownerId != null ? String(r.ownerId) : null,
        enabled: toBool(r.enabled ?? true),
        createdAt: toDate(r.createdAt) ?? new Date(),
        lastUsedAt: toDate(r.lastUsedAt),
        rollingInputTokensUsed: Number(r.rollingInputTokensUsed ?? 0),
        rollingCachedReadTokensUsed: Number(r.rollingCachedReadTokensUsed ?? 0),
        rollingOutputTokensUsed: Number(r.rollingOutputTokensUsed ?? 0),
        weekInputTokensUsed: Number(r.weekInputTokensUsed ?? 0),
        weekCachedReadTokensUsed: Number(r.weekCachedReadTokensUsed ?? 0),
        weekOutputTokensUsed: Number(r.weekOutputTokensUsed ?? 0),
        monthInputTokensUsed: Number(r.monthInputTokensUsed ?? 0),
        monthCachedReadTokensUsed: Number(r.monthCachedReadTokensUsed ?? 0),
        monthOutputTokensUsed: Number(r.monthOutputTokensUsed ?? 0),
        rollingQuotaResetAt: toDate(r.rollingQuotaResetAt),
        weekQuotaResetAt: toDate(r.weekQuotaResetAt),
        monthQuotaResetAt: toDate(r.monthQuotaResetAt),
      },
      update: {},
    });
  }
  counts.ApiKey = rows.length;
}

async function migrateStickyRoutes(): Promise<void> {
  const rows = tableData.get("StickyRoute") ?? [];
  for (const r of rows) {
    await prisma.stickyRoute.upsert({
      where: {
        apiKeyId_modelId: {
          apiKeyId: String(r.apiKeyId),
          modelId: String(r.modelId),
        },
      },
      create: {
        apiKeyId: String(r.apiKeyId),
        modelId: String(r.modelId),
        providerId: String(r.providerId),
        pmId: String(r.pmId),
        expiresAt: toDate(r.expiresAt) ?? new Date(),
      },
      update: {},
    });
  }
  counts.StickyRoute = rows.length;
}

async function migrateSystemSettings(): Promise<void> {
  const rows = tableData.get("SystemSetting") ?? [];
  for (const r of rows) {
    await prisma.systemSetting.upsert({
      where: { key: String(r.key) },
      create: {
        key: String(r.key),
        value: String(r.value),
        updatedAt: toDate(r.updatedAt) ?? new Date(),
      },
      update: {},
    });
  }
  counts.SystemSetting = rows.length;
}

(async () => {
  try {
    await migrateAdminUsers();
    await migrateUserPreferences();
    await migrateModels();
    await migrateProviders();
    await migrateProviderModels();
    await migrateApiKeys();
    await migrateStickyRoutes();
    await migrateSystemSettings();

    // ── Summary ─────────────────────────────────────────────────────
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║   Migration Complete                         ║");
    console.log("╚══════════════════════════════════════════════╝\n");
    for (const [table, count] of Object.entries(counts)) {
      console.log(`  ✅ ${table}: ${count} row(s)`);
    }
    console.log("\n📝 Next steps:");
    console.log(
      "  1. Run: npx prisma migrate dev --name init_pg --create-only",
    );
    console.log("     (to baseline the migration history)");
    console.log("  2. Verify: npx prisma studio");
    console.log("  3. Start app: pnpm dev");
  } catch (err) {
    console.error("\n❌ Migration failed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
