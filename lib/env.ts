/**
 * Centralized env config. Validates required vars at boot.
 */
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(16),

  ADMIN_INIT_USERNAME: z.string().min(1).default("admin"),
  ADMIN_INIT_PASSWORD: z.string().min(1).default("changeme"),

  DATA_DIR: z.string().default("./data"),

  LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  STAT_RETENTION_MONTHS: z.coerce.number().int().positive().default(24),

  QUOTA_REFRESH_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  QUOTA_REFRESH_CONCURRENCY: z.coerce.number().int().positive().default(4),
  QUOTA_EXHAUST_THRESHOLD: z.coerce.number().min(0).max(100).default(100),
  MAX_QUOTA_RETRIES: z.coerce.number().int().positive().default(3),

  /** Public base URL when behind a reverse proxy (e.g. https://ai-router.example.com) */
  NEXTAUTH_URL: z.string().url().optional(),
  /** Internal base URL used by the server to reach itself (e.g. http://localhost:3001) */
  NEXTAUTH_URL_INTERNAL: z.string().url().optional(),

  METRICS_FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(1_000),
  METRICS_FLUSH_BATCH_SIZE: z.coerce.number().int().positive().default(500),
  METRICS_BUFFER_MAX: z.coerce.number().int().positive().default(5_000),

  SQLITE_POOL_MAX: z.coerce.number().int().positive().default(16),

  /** Sticky routing TTL in milliseconds. Default 5 minutes. */
  STICKY_TTL_MS: z.coerce.number().int().positive().default(300_000),
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;

/** Fixed plaintext prefix for externally-issued API keys. Never stored in DB. */
export const API_KEY_PREFIX = "sk-y6-";

// ---------------------------------------------------------------------------
// Runtime config: merges DB overrides (SystemSetting) on top of env defaults.
// Workers call `getRuntimeSetting(key)` instead of `env[key]` for mutable
// operational settings. DB values take precedence when present.
// ---------------------------------------------------------------------------

const runtimeCache = new Map<string, string | number>();
let runtimeLoaded = false;

/** Default values for runtime-overridable settings (from env). */
const RUNTIME_DEFAULTS: Record<string, number> = {
  LOG_RETENTION_DAYS: env.LOG_RETENTION_DAYS,
  STAT_RETENTION_MONTHS: env.STAT_RETENTION_MONTHS,
  QUOTA_REFRESH_INTERVAL_MS: env.QUOTA_REFRESH_INTERVAL_MS,
  QUOTA_REFRESH_CONCURRENCY: env.QUOTA_REFRESH_CONCURRENCY,
  QUOTA_EXHAUST_THRESHOLD: env.QUOTA_EXHAUST_THRESHOLD,
  METRICS_FLUSH_INTERVAL_MS: env.METRICS_FLUSH_INTERVAL_MS,
  METRICS_FLUSH_BATCH_SIZE: env.METRICS_FLUSH_BATCH_SIZE,
  STICKY_TTL_MS: env.STICKY_TTL_MS,
};

/**
 * Load DB overrides into memory. Safe to call multiple times (idempotent).
 * Called lazily on first `getRuntimeSetting()` and can be refreshed via
 * `refreshRuntimeConfig()`.
 */
export async function loadRuntimeConfig(): Promise<void> {
  try {
    const { systemSettingRepo } =
      await import("@/lib/repositories/systemSettingRepo");
    const overrides = await systemSettingRepo.getAll();
    for (const [k, v] of Object.entries(RUNTIME_DEFAULTS)) {
      runtimeCache.set(k, v);
    }
    for (const [k, v] of Object.entries(overrides)) {
      if (k in RUNTIME_DEFAULTS) {
        const num = Number(v);
        runtimeCache.set(k, isNaN(num) ? v : num);
      }
    }
    runtimeLoaded = true;
  } catch {
    // DB not ready yet — fall back to env defaults
    for (const [k, v] of Object.entries(RUNTIME_DEFAULTS)) {
      if (!runtimeCache.has(k)) runtimeCache.set(k, v);
    }
    runtimeLoaded = true;
  }
}

/** Refresh runtime config after admin settings change. */
export async function refreshRuntimeConfig(): Promise<void> {
  runtimeLoaded = false;
  runtimeCache.clear();
  await loadRuntimeConfig();
}

/**
 * Get a runtime setting value. Falls back to env default if DB is unavailable.
 * Must be awaited on first call; subsequent calls return from cache.
 */
export async function getRuntimeSetting(key: string): Promise<number> {
  if (!runtimeLoaded) await loadRuntimeConfig();
  const v = runtimeCache.get(key);
  if (v != null) return Number(v);
  return Number(RUNTIME_DEFAULTS[key] ?? 0);
}

/**
 * Synchronous accessor for hot paths (after initial load).
 * Returns env default if cache hasn't been populated yet.
 */
export function getRuntimeSettingSync(key: string): number {
  const v = runtimeCache.get(key);
  if (v != null) return Number(v);
  return Number(RUNTIME_DEFAULTS[key] ?? 0);
}
