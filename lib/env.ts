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

  /** Public base URL when behind a reverse proxy (e.g. https://ai-router.example.com) */
  NEXTAUTH_URL: z.string().url().optional(),
  /** Internal base URL used by the server to reach itself (e.g. http://localhost:3001) */
  NEXTAUTH_URL_INTERNAL: z.string().url().optional(),

  METRICS_FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(1_000),
  METRICS_FLUSH_BATCH_SIZE: z.coerce.number().int().positive().default(500),
  METRICS_BUFFER_MAX: z.coerce.number().int().positive().default(5_000),

  SQLITE_POOL_MAX: z.coerce.number().int().positive().default(16),
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;

/** Fixed plaintext prefix for externally-issued API keys. Never stored in DB. */
export const API_KEY_PREFIX = "sk-y6-";
