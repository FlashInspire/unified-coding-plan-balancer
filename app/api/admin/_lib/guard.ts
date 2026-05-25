/**
 * Admin API — all routes are session-protected.
 * Shared helper to enforce auth.
 */
import { auth } from "@/lib/auth/nextauth";

export async function requireAdmin(): Promise<Response | null> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null; // authorized
}
