import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAdmin } from "../../_lib/guard";
import { adminUserRepo } from "@/lib/repositories/adminUserRepo";

const patchSchema = z.object({
  mustChangePassword: z.boolean().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(["admin", "user"]).optional(),
  email: z.string().max(256).nullable().optional(),
  displayName: z.string().max(128).nullable().optional(),
  avatarUrl: z.string().max(1024).nullable().optional(),
  rollingQuota: z.number().int().nonnegative().nullable().optional(),
  weekQuota: z.number().int().nonnegative().nullable().optional(),
  monthQuota: z.number().int().nonnegative().nullable().optional(),
  quotaMultiplierInput: z.number().nonnegative().optional(),
  quotaMultiplierCachedRead: z.number().nonnegative().optional(),
  quotaMultiplierOutput: z.number().nonnegative().optional(),
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

    if (body.password) {
      await adminUserRepo.adminResetPassword(id, body.password);
    }
    if (body.mustChangePassword != null) {
      await adminUserRepo.setMustChangePassword(id, body.mustChangePassword);
    }
    if (body.role != null) {
      await adminUserRepo.updateRole(id, body.role);
    }
    if (
      body.email !== undefined ||
      body.displayName !== undefined ||
      body.avatarUrl !== undefined
    ) {
      await adminUserRepo.updateProfile(id, {
        email: body.email,
        displayName: body.displayName,
        avatarUrl: body.avatarUrl,
      });
    }
    if (
      body.rollingQuota !== undefined ||
      body.weekQuota !== undefined ||
      body.monthQuota !== undefined ||
      body.quotaMultiplierInput !== undefined ||
      body.quotaMultiplierCachedRead !== undefined ||
      body.quotaMultiplierOutput !== undefined
    ) {
      await adminUserRepo.updateQuota(id, {
        rollingQuota: body.rollingQuota,
        weekQuota: body.weekQuota,
        monthQuota: body.monthQuota,
        quotaMultiplierInput: body.quotaMultiplierInput,
        quotaMultiplierCachedRead: body.quotaMultiplierCachedRead,
        quotaMultiplierOutput: body.quotaMultiplierOutput,
      });
    }

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
