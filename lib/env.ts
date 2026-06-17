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

  QUOTA_EXHAUST_THRESHOLD: z.coerce.number().min(0).max(100).default(100),
  MAX_QUOTA_RETRIES: z.coerce.number().int().positive().default(3),
  /** Number of times to probe a provider on 429 before marking it "Running out". */
  RUNNING_OUT_PROBE_TIMES: z.coerce.number().int().positive().default(2),

  /** Public base URL when behind a reverse proxy (e.g. https://ai-router.example.com) */
  NEXTAUTH_URL: z.string().url().optional(),
  /** Internal base URL used by the server to reach itself (e.g. http://localhost:3001) */
  NEXTAUTH_URL_INTERNAL: z.string().url().optional(),

  METRICS_FLUSH_BATCH_SIZE: z.coerce.number().int().positive().default(500),
  METRICS_BUFFER_MAX: z.coerce.number().int().positive().default(5_000),

  /** Sticky routing TTL in milliseconds. Default 5 minutes. */
  STICKY_TTL_MS: z.coerce.number().int().positive().default(300_000),

  /** Number of times to retry a non-429 retryable error (5xx, network) on the
   *  same provider before falling back to the next candidate. Default 0. */
  UPSTREAM_ERROR_RETRIES: z.coerce.number().int().min(0).default(0),

  /** Load-balance mode for provider selection. */
  LOAD_BALANCE_MODE: z
    .enum(["weighted", "round-robin", "strict-weight"])
    .default("weighted"),
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
  QUOTA_EXHAUST_THRESHOLD: env.QUOTA_EXHAUST_THRESHOLD,
  METRICS_FLUSH_BATCH_SIZE: env.METRICS_FLUSH_BATCH_SIZE,
  STICKY_TTL_MS: env.STICKY_TTL_MS,
  UPSTREAM_ERROR_RETRIES: env.UPSTREAM_ERROR_RETRIES,
};

/** Default values for runtime-overridable string settings. */
const RUNTIME_STRING_DEFAULTS: Record<string, string> = {
  LOAD_BALANCE_MODE: env.LOAD_BALANCE_MODE,
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
    for (const [k, v] of Object.entries(RUNTIME_STRING_DEFAULTS)) {
      if (!runtimeCache.has(k)) runtimeCache.set(k, v);
    }
    for (const [k, v] of Object.entries(overrides)) {
      if (k in RUNTIME_DEFAULTS) {
        const num = Number(v);
        runtimeCache.set(k, isNaN(num) ? v : num);
      } else if (k in RUNTIME_STRING_DEFAULTS) {
        runtimeCache.set(k, v);
      }
    }
    runtimeLoaded = true;
  } catch {
    // DB not ready yet — fall back to env defaults
    for (const [k, v] of Object.entries(RUNTIME_DEFAULTS)) {
      if (!runtimeCache.has(k)) runtimeCache.set(k, v);
    }
    for (const [k, v] of Object.entries(RUNTIME_STRING_DEFAULTS)) {
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

/**
 * Get a runtime string setting. Falls back to env default if DB is
 * unavailable. Must be awaited on first call; subsequent calls from cache.
 */
export async function getRuntimeSettingString(key: string): Promise<string> {
  if (!runtimeLoaded) await loadRuntimeConfig();
  const v = runtimeCache.get(key);
  if (v != null) return String(v);
  return RUNTIME_STRING_DEFAULTS[key] ?? "";
}

/**
 * Synchronous string accessor for hot paths (after initial load).
 * Returns env default if cache hasn't been populated yet.
 */
export function getRuntimeSettingStringSync(key: string): string {
  const v = runtimeCache.get(key);
  if (v != null) return String(v);
  return RUNTIME_STRING_DEFAULTS[key] ?? "";
}
