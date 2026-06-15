import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAuth } from "../_lib/guard";
import { adminUserRepo } from "@/lib/repositories/adminUserRepo";
import { verifyPassword } from "@/lib/auth/password";

const schema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export async function POST(req: NextRequest): Promise<Response> {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const session = authResult;

  try {
    const body = schema.parse(await req.json());

    const userId = session.user.id;
    const user = await adminUserRepo.findById(userId);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const ok = await verifyPassword(body.oldPassword, user.passwordHash);
    if (!ok) {
      return Response.json(
        { error: "Current password is incorrect" },
        { status: 400 },
      );
    }

    await adminUserRepo.updatePassword(user.id, body.newPassword);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid request" },
      { status: 400 },
    );
  }
}
