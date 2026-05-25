import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAdmin } from "../_lib/guard";
import { modelRepo } from "@/lib/repositories/modelRepo";

const createSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  contextLength: z.number().int().positive(),
  maxTokens: z.number().int().positive(),
  temperature: z.number().optional(),
  topP: z.number().optional(),
  topK: z.number().int().optional(),
  reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
  includeReasoningInRequest: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const list = await modelRepo.list();
  return Response.json({ data: list });
}

export async function POST(req: NextRequest): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const data = createSchema.parse(await req.json());
    const row = await modelRepo.create(data);
    return Response.json({ data: row });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid" },
      { status: 400 },
    );
  }
}
