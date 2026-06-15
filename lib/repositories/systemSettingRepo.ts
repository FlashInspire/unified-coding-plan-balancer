import { prisma } from "@/lib/prisma";

/** Allowed load-balance mode values. */
export const LOAD_BALANCE_MODES = [
  "weighted",
  "round-robin",
  "strict-weight",
] as const;

export type LoadBalanceMode = (typeof LOAD_BALANCE_MODES)[number];

/** Keys that can be overridden at runtime via the SystemSetting table. */
export const RUNTIME_SETTING_KEYS = [
  "LOAD_BALANCE_MODE",
  "LOG_RETENTION_DAYS",
  "STAT_RETENTION_MONTHS",
  "QUOTA_REFRESH_INTERVAL_MS",
  "QUOTA_REFRESH_CONCURRENCY",
  "QUOTA_EXHAUST_THRESHOLD",
  "METRICS_FLUSH_INTERVAL_MS",
  "METRICS_FLUSH_BATCH_SIZE",
  "STICKY_TTL_MS",
] as const;

export type RuntimeSettingKey = (typeof RUNTIME_SETTING_KEYS)[number];

export const systemSettingRepo = {
  async getAll(): Promise<Record<string, string>> {
    const rows = await prisma.systemSetting.findMany();
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  },

  async get(key: string): Promise<string | null> {
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  },

  async set(key: string, value: string): Promise<void> {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  },

  async setMany(pairs: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(pairs)) {
      await this.set(key, value);
    }
  },
};
