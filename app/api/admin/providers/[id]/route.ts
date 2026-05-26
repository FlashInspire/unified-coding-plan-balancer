import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAdmin } from "../../_lib/guard";
import { providerRepo } from "@/lib/repositories/providerRepo";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
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
  rollingHourOffset: z.number().int().min(0).max(23).optional(),
  weight: z.number().int().min(0).optional(),
  enabled: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const row = await providerRepo.findById(id);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ data: row });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  try {
    const data = updateSchema.parse(await req.json());
    const row = await providerRepo.update(id, data);
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
  await providerRepo.delete(id);
  return Response.json({ ok: true });
}
