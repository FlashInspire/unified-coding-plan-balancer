import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAdmin } from "../_lib/guard";
import { adminUserRepo } from "@/lib/repositories/adminUserRepo";

const createSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(6),
});

export async function GET(): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const users = await adminUserRepo.findAll();
  return Response.json({ data: users });
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

    const user = await adminUserRepo.create(body.username, body.password);
    return Response.json({
      data: {
        id: user.id,
        username: user.username,
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
