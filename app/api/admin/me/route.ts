import { auth } from "@/lib/auth/nextauth";
import { adminUserRepo } from "@/lib/repositories/adminUserRepo";
import { userPreferenceRepo } from "@/lib/repositories/userPreferenceRepo";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user, prefs] = await Promise.all([
    adminUserRepo.findById(session.user.id),
    userPreferenceRepo.get(session.user.id),
  ]);
  if (!user) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({
    data: {
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      mustChangePassword: user.mustChangePassword,
      lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      language: prefs.language,
      theme: prefs.theme,
      // User-level quota (read-only for non-admins)
      rollingQuota:
        user.rollingQuota != null ? Number(user.rollingQuota) : null,
      weekQuota: user.weekQuota != null ? Number(user.weekQuota) : null,
      monthQuota: user.monthQuota != null ? Number(user.monthQuota) : null,
      rollingQuotaUsed: user.rollingQuotaUsed ?? 0,
      weekQuotaUsed: user.weekQuotaUsed ?? 0,
      monthQuotaUsed: user.monthQuotaUsed ?? 0,
      rollingInputTokensUsed: user.rollingInputTokensUsed,
      rollingCachedReadTokensUsed: user.rollingCachedReadTokensUsed,
      rollingOutputTokensUsed: user.rollingOutputTokensUsed,
      weekInputTokensUsed: user.weekInputTokensUsed,
      weekCachedReadTokensUsed: user.weekCachedReadTokensUsed,
      weekOutputTokensUsed: user.weekOutputTokensUsed,
      monthInputTokensUsed: user.monthInputTokensUsed,
      monthCachedReadTokensUsed: user.monthCachedReadTokensUsed,
      monthOutputTokensUsed: user.monthOutputTokensUsed,
      quotaMultiplierInput: user.quotaMultiplierInput,
      quotaMultiplierCachedRead: user.quotaMultiplierCachedRead,
      quotaMultiplierOutput: user.quotaMultiplierOutput,
    },
  });
}

const patchProfileSchema = z.object({
  email: z.string().max(256).nullable().optional(),
  displayName: z.string().max(128).nullable().optional(),
  avatarUrl: z.string().max(1024).nullable().optional(),
});

export async function PATCH(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = patchProfileSchema.parse(await req.json());
    await adminUserRepo.updateProfile(session.user.id, body);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid request" },
      { status: 400 },
    );
  }
}
