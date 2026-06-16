import type { NextRequest } from "next/server";
import { requireAuth } from "../../../_lib/guard";
import { apiKeyRepo } from "@/lib/repositories/apiKeyRepo";

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

export async function POST(
  _req: NextRequest,
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
    const regenerated = await apiKeyRepo.regenerate(id);
    return Response.json({ data: regenerated });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid" },
      { status: 400 },
    );
  }
}
