import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAdmin } from "../../_lib/guard";
import { apiKeyRepo } from "@/lib/repositories/apiKeyRepo";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  rollingQuota: z.number().int().nonnegative().nullable().optional(),
  weekQuota: z.number().int().nonnegative().nullable().optional(),
  monthQuota: z.number().int().nonnegative().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  try {
    const data = patchSchema.parse(await req.json());
    const row = await apiKeyRepo.update(id, data);
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
  await apiKeyRepo.delete(id);
  return Response.json({ ok: true });
}
