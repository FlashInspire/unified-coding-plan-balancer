import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAdmin } from "../_lib/guard";
import { adminUserRepo } from "@/lib/repositories/adminUserRepo";

const createSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(6),
  role: z.enum(["admin", "user"]).optional().default("user"),
  email: z.string().max(256).optional(),
  displayName: z.string().max(128).optional(),
  avatarUrl: z.string().max(1024).optional(),
});

export async function GET(): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const users = await adminUserRepo.findAll();
  // Prisma returns BigInt for `rollingQuota`/`weekQuota`/`monthQuota`, which
  // `Response.json` (JSON.stringify) cannot serialize. Convert to Number.
  const data = users.map((u) => ({
    ...u,
    rollingQuota: u.rollingQuota == null ? null : Number(u.rollingQuota),
    weekQuota: u.weekQuota == null ? null : Number(u.weekQuota),
    monthQuota: u.monthQuota == null ? null : Number(u.monthQuota),
  }));
  return Response.json({ data });
}

export async function POST(req: NextRequest): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const body = createSchema.parse(await req.json());

    const existing = await adminUserRepo.findByUsername(body.username);
    if (existing) {
      return Response.json(
        { error: "Username already exists" },
        { status: 409 },
      );
    }

    const user = await adminUserRepo.create(body.username, body.password, {
      role: body.role,
      email: body.email || null,
      displayName: body.displayName || null,
      avatarUrl: body.avatarUrl || null,
    });
    return Response.json({
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt,
      },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid request" },
      { status: 400 },
    );
  }
}
