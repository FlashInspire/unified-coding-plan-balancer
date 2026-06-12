import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAdmin } from "../_lib/guard";
import { providerModelRepo } from "@/lib/repositories/providerModelRepo";

const createSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  realModelId: z.string().nullable().optional(),
  contextLengthOverride: z.number().int().positive().nullable().optional(),
  maxTokensOverride: z.number().int().positive().nullable().optional(),
  temperatureOverride: z.number().nullable().optional(),
  topPOverride: z.number().nullable().optional(),
  topKOverride: z.number().int().nullable().optional(),
  reasoningEffortOverride: z
    .enum(["low", "medium", "high"])
    .nullable()
    .optional(),
  includeReasoningInRequestOverride: z.boolean().nullable().optional(),
  weight: z.number().int().min(0).optional(),
  feeRateInput: z.number().min(0).optional(),
  feeRateCachedInput: z.number().min(0).optional(),
  feeRateOutput: z.number().min(0).optional(),
  enabled: z.boolean().optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const list = await providerModelRepo.list();
  return Response.json({ data: list });
}

export async function POST(req: NextRequest): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const data = createSchema.parse(await req.json());
    const row = await providerModelRepo.create(data);
    return Response.json({ data: row });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid" },
      { status: 400 },
    );
  }
}
