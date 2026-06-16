/**
 * GET /api/admin/logs/filters — Returns distinct model and provider IDs
 * available in the recent request_log data, respecting the caller's auth scope
 * and optional filter params (status, search). Used to populate filter bar
 * dropdowns independently of pagination.
 *
 * Query params:
 *   status = "ok" | "error" | "inflight" (optional)
 *   search = string (optional)
 */
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAuth } from "../../_lib/guard";
import { recentLogFilters } from "@/lib/metrics/queryRouter";
import { apiKeyRepo } from "@/lib/repositories/apiKeyRepo";

const querySchema = z.object({
  status: z.enum(["ok", "error", "inflight"]).optional(),
  search: z.string().optional(),
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
      return Response.json({ modelIds: [], providerIds: [] });
    }
  }

  const result = await recentLogFilters({
    apiKeyIds,
    status: q.status,
    search: q.search,
  });

  return Response.json(result);
}
