import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAdmin } from "../_lib/guard";
import { recentLogs } from "@/lib/metrics/queryRouter";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional().default(100),
  days: z.coerce.number().int().min(1).max(30).optional().default(2),
  apiKeyId: z.string().optional(),
  modelId: z.string().optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const q = querySchema.parse(Object.fromEntries(sp.entries()));
  const rows = recentLogs({
    limit: q.limit,
    days: q.days,
    apiKeyId: q.apiKeyId,
    modelId: q.modelId,
  });
  return Response.json({ data: rows });
}
