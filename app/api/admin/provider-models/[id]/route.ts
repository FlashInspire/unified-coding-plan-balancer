import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAdmin } from "../../_lib/guard";
import { providerModelRepo } from "@/lib/repositories/providerModelRepo";

const updateSchema = z.object({
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
  apiStyle: z.enum(["auto", "openai", "anthropic"]).optional(),
  feeRateInput: z.number().min(0).optional(),
  feeRateCachedInput: z.number().min(0).optional(),
  feeRateOutput: z.number().min(0).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  try {
    const data = updateSchema.parse(await req.json());
    const row = await providerModelRepo.update(id, data);
    return Response.json({ data: row });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  await providerModelRepo.delete(id);
  return Response.json({ ok: true });
}
