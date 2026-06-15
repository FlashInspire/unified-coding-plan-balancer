/**
 * Admin API — all routes are session-protected.
 * Shared helpers to enforce auth.
 */
import { auth } from "@/lib/auth/nextauth";
import type { Session } from "next-auth";

/** Require admin role. Returns error Response if denied, null if authorized. */
export async function requireAdmin(): Promise<Response | null> {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null; // authorized
}

/** Require any authenticated user. Returns the session if authorized, or error Response. */
export async function requireAuth(): Promise<Session | Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}
