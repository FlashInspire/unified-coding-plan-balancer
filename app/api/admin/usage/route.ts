import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAuth } from "../_lib/guard";
import { usageInMonth } from "@/lib/metrics/queryRouter";
import { apiKeyRepo } from "@/lib/repositories/apiKeyRepo";

const querySchema = z.object({
  month: z.string().optional(), // YYYY-MM, defaults to current month
});

export async function GET(req: NextRequest): Promise<Response> {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const session = authResult;

  const sp = req.nextUrl.searchParams;
  const q = querySchema.parse(Object.fromEntries(sp.entries()));

  const isAdmin = session.user.role === "admin";
  let apiKeyIds: string[] | undefined;
  if (!isAdmin) {
    apiKeyIds = await apiKeyRepo.findIdsByOwner(session.user.id);
    if (apiKeyIds.length === 0) {
      return Response.json({ data: [] });
    }
  }

  const rows = usageInMonth(q.month, apiKeyIds);
  return Response.json({ data: rows });
}
