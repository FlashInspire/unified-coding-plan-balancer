import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAdmin } from "../../_lib/guard";
import { adminUserRepo } from "@/lib/repositories/adminUserRepo";

const patchSchema = z.object({
  mustChangePassword: z.boolean(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  const user = await adminUserRepo.findById(id);
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  try {
    const body = patchSchema.parse(await req.json());
    await adminUserRepo.setMustChangePassword(id, body.mustChangePassword);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid request" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  // Prevent self-deletion
  const session = await import("@/lib/auth/nextauth").then((m) => m.auth());
  if (session?.user?.id === id) {
    return Response.json(
      { error: "Cannot delete your own account" },
      { status: 400 },
    );
  }

  const user = await adminUserRepo.findById(id);
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  await adminUserRepo.delete(id);
  return Response.json({ ok: true });
}
