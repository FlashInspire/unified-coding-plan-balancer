import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAuth } from "../_lib/guard";
import { apiKeyRepo } from "@/lib/repositories/apiKeyRepo";

const createSchema = z.object({
  name: z.string().min(1),
});

export async function GET(_req: NextRequest): Promise<Response> {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const session = authResult;

  const isAdmin = session.user.role === "admin";
  const list = await apiKeyRepo.list(isAdmin ? undefined : session.user.id);
  return Response.json({ data: list });
}

export async function POST(req: NextRequest): Promise<Response> {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const session = authResult;

  try {
    const data = createSchema.parse(await req.json());
    const created = await apiKeyRepo.create(data.name, session.user.id);
    // plaintext returned ONCE
    return Response.json({ data: created });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid" },
      { status: 400 },
    );
  }
}
