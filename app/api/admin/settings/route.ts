import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAdmin } from "../_lib/guard";
import {
  systemSettingRepo,
  RUNTIME_SETTING_KEYS,
  LOAD_BALANCE_MODES,
} from "@/lib/repositories/systemSettingRepo";
import { env, refreshRuntimeConfig } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Get all settings (env defaults merged with DB overrides). */
export async function GET(): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const overrides = await systemSettingRepo.getAll();
  const defaults: Record<string, string | number> = {
    LOAD_BALANCE_MODE: env.LOAD_BALANCE_MODE,
    LOG_RETENTION_DAYS: env.LOG_RETENTION_DAYS,
    STAT_RETENTION_MONTHS: env.STAT_RETENTION_MONTHS,
    QUOTA_REFRESH_INTERVAL_MS: env.QUOTA_REFRESH_INTERVAL_MS,
    QUOTA_REFRESH_CONCURRENCY: env.QUOTA_REFRESH_CONCURRENCY,
    QUOTA_EXHAUST_THRESHOLD: env.QUOTA_EXHAUST_THRESHOLD,
    METRICS_FLUSH_INTERVAL_MS: env.METRICS_FLUSH_INTERVAL_MS,
    METRICS_FLUSH_BATCH_SIZE: env.METRICS_FLUSH_BATCH_SIZE,
    STICKY_TTL_MS: env.STICKY_TTL_MS,
  };

  const settings: Record<string, { value: string; source: "db" | "env" }> = {};
  for (const key of RUNTIME_SETTING_KEYS) {
    if (key in overrides) {
      settings[key] = { value: overrides[key], source: "db" };
    } else {
      settings[key] = { value: String(defaults[key] ?? ""), source: "env" };
    }
  }

  return Response.json({ data: settings });
}

const patchSchema = z.record(z.string(), z.string());

/** Update one or more settings. */
export async function PATCH(req: NextRequest): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const body: Record<string, string> = patchSchema.parse(await req.json());

    // Validate all keys are allowed
    for (const key of Object.keys(body)) {
      if (
        !RUNTIME_SETTING_KEYS.includes(
          key as (typeof RUNTIME_SETTING_KEYS)[number],
        )
      ) {
        return Response.json(
          { error: `Unknown setting: ${key}` },
          { status: 400 },
        );
      }
    }

    // Validate enum values for known string settings
    const lbm = body["LOAD_BALANCE_MODE"];
    if (
      lbm !== undefined &&
      !LOAD_BALANCE_MODES.includes(lbm as (typeof LOAD_BALANCE_MODES)[number])
    ) {
      return Response.json(
        {
          error: `Invalid LOAD_BALANCE_MODE: ${lbm}. Must be one of: ${LOAD_BALANCE_MODES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    await systemSettingRepo.setMany(body);
    await refreshRuntimeConfig();

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid request" },
      { status: 400 },
    );
  }
}
