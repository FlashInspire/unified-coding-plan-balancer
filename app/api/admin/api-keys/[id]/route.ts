import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAuth } from "../../_lib/guard";
import { apiKeyRepo } from "@/lib/repositories/apiKeyRepo";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  rollingQuota: z.number().int().nonnegative().nullable().optional(),
  weekQuota: z.number().int().nonnegative().nullable().optional(),
  monthQuota: z.number().int().nonnegative().nullable().optional(),
});

/** Verify the key belongs to the user (non-admin) or return true (admin). */
async function checkOwnership(
  keyId: string,
  userId: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true;
  const key = await apiKeyRepo.findById(keyId);
  return key?.ownerId === userId;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const session = authResult;

  const { id } = await params;
  const isAdmin = session.user.role === "admin";

  if (!(await checkOwnership(id, session.user.id, isAdmin))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

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
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const session = authResult;

  const { id } = await params;
  const isAdmin = session.user.role === "admin";

  if (!(await checkOwnership(id, session.user.id, isAdmin))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await apiKeyRepo.delete(id);
  return Response.json({ ok: true });
}
