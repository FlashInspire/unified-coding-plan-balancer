import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAdmin } from "../_lib/guard";
import { providerRepo } from "@/lib/repositories/providerRepo";

const createSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    baseUrlOpenai: z.string().url().nullable().optional(),
    apiKeyOpenai: z.string().min(1).nullable().optional(),
    baseUrlAnthropic: z.string().url().nullable().optional(),
    apiKeyAnthropic: z.string().min(1).nullable().optional(),
    headersTemplate: z.record(z.string(), z.string()).optional(),
    rollingQuota: z.number().int().nullable().optional(),
    weekQuota: z.number().int().nullable().optional(),
    monthQuota: z.number().int().nullable().optional(),
    rollingQuotaUsed: z.number().int().optional(),
    weekQuotaUsed: z.number().int().optional(),
    monthQuotaUsed: z.number().int().optional(),
    rollingCacheInputTokensUsed: z.number().optional(),
    rollingOutputTokensUsed: z.number().optional(),
    weekCacheInputTokensUsed: z.number().optional(),
    weekOutputTokensUsed: z.number().optional(),
    monthCacheInputTokensUsed: z.number().optional(),
    monthOutputTokensUsed: z.number().optional(),
    rollingHourOffset: z.number().int().min(0).max(23).optional(),
    usageMode: z.enum(["request", "token"]).optional(),
    weight: z.number().int().min(0).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((d) => d.baseUrlOpenai || d.baseUrlAnthropic, {
    message: "At least one of baseUrlOpenai or baseUrlAnthropic is required",
  });

export async function GET(req: NextRequest): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const list = await providerRepo.list();
  return Response.json({ data: list });
}

export async function POST(req: NextRequest): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const data = createSchema.parse(await req.json());
    const row = await providerRepo.create(data);
    return Response.json({ data: row });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid" },
      { status: 400 },
    );
  }
}
