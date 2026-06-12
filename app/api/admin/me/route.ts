import { auth } from "@/lib/auth/nextauth";
import { adminUserRepo } from "@/lib/repositories/adminUserRepo";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await adminUserRepo.findById(session.user.id);
  if (!user) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({
    data: {
      id: user.id,
      username: user.username,
      mustChangePassword: user.mustChangePassword,
      lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    },
  });
}
