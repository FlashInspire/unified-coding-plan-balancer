import { z } from "zod";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/nextauth";
import { verifyPassword } from "@/lib/auth/password";
import { adminUserRepo } from "@/lib/repositories/adminUserRepo";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

export async function POST(req: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = schema.parse(await req.json());

    const user = await adminUserRepo.findById(session.user.id);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const ok = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!ok) {
      return Response.json(
        { error: "Current password is incorrect" },
        { status: 400 },
      );
    }

    await adminUserRepo.updatePassword(session.user.id, body.newPassword);
    // updatePassword already clears mustChangePassword

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid request" },
      { status: 400 },
    );
  }
}
