import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAdmin } from "../_lib/guard";
import { recentLogs } from "@/lib/metrics/queryRouter";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
  days: z.coerce.number().int().min(1).max(30).optional().default(2),
  apiKeyId: z.string().optional(),
  modelId: z.string().optional(),
  providerId: z.string().optional(),
  status: z.enum(["ok", "error", "inflight"]).optional(),
  search: z.string().optional(),
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const q = querySchema.parse(Object.fromEntries(sp.entries()));
  const result = recentLogs({
    limit: q.limit,
    offset: q.offset,
    days: q.days,
    apiKeyId: q.apiKeyId,
    modelId: q.modelId,
    providerId: q.providerId,
    status: q.status,
    search: q.search,
    from: q.from,
    to: q.to,
  });
  return Response.json({ data: result.rows, total: result.total });
}
