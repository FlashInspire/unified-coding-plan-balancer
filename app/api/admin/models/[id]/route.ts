import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAdmin } from "../../_lib/guard";
import { modelRepo } from "@/lib/repositories/modelRepo";

const updateSchema = z.object({
  displayName: z.string().min(1).optional(),
  contextLength: z.number().int().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().optional(),
  topP: z.number().optional(),
  topK: z.number().int().optional(),
  reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
  includeReasoningInRequest: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const row = await modelRepo.findById(id);
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
    const row = await modelRepo.update(id, data);
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
  await modelRepo.delete(id);
  return Response.json({ ok: true });
}
