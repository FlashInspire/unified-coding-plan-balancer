import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAdmin } from "../_lib/guard";
import { apiKeyRepo } from "@/lib/repositories/apiKeyRepo";

const createSchema = z.object({
  name: z.string().min(1),
});

export async function GET(req: NextRequest): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const list = await apiKeyRepo.list();
  return Response.json({ data: list });
}

export async function POST(req: NextRequest): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const data = createSchema.parse(await req.json());
    const created = await apiKeyRepo.create(data.name);
    // plaintext returned ONCE
    return Response.json({ data: created });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid" },
      { status: 400 },
    );
  }
}
