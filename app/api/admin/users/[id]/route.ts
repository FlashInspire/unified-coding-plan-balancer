import type { NextRequest } from "next/server";
import { requireAdmin } from "../../_lib/guard";
import { adminUserRepo } from "@/lib/repositories/adminUserRepo";

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
