/**
 * GET /api/admin/aggregate-reports — Query pre-aggregated reports.
 *
 * Query params:
 *   granularity = "hour" | "day" | "week" | "month" (required)
 *   from = epoch_ms (optional)
 *   to = epoch_ms (optional)
 *   providerId = string (optional)
 *   modelId = string (optional)
 *   apiKeyId = string (optional)
 *   limit = number (default 100)
 *   offset = number (default 0)
 */
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAuth } from "../_lib/guard";
import { aggregateReport } from "@/lib/metrics/queryRouter";
import { apiKeyRepo } from "@/lib/repositories/apiKeyRepo";

const querySchema = z.object({
  granularity: z.enum(["hour", "day", "week", "month"]),
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  apiKeyId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export async function GET(req: NextRequest): Promise<Response> {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const session = authResult;

  const sp = req.nextUrl.searchParams;
  const q = querySchema.parse(Object.fromEntries(sp.entries()));

  // Non-admin users only see their own API key data.
  const isAdmin = session.user.role === "admin";
  let apiKeyId = q.apiKeyId;
  let apiKeyIds: string[] | undefined;

  if (!isAdmin) {
    apiKeyIds = await apiKeyRepo.findIdsByOwner(session.user.id);
    if (apiKeyIds.length === 0) {
      return Response.json({ data: [], total: 0 });
    }
    // If user specified a key, verify ownership
    if (apiKeyId) {
      if (!apiKeyIds.includes(apiKeyId)) {
        return Response.json({ data: [], total: 0 });
      }
    } else {
      // Restrict to user's keys — use the first key as filter
      // (we'll pass all user key IDs in the future if needed)
      apiKeyId = undefined; // will be handled by apiKeyIds
    }
  }

  // For non-admin with no specific key filter, we query without apiKeyId
  // and let the caller handle filtering. The aggregate_report table
  // doesn't support OR on apiKeyId easily, so we query per key if needed.
  if (!isAdmin && !apiKeyId && apiKeyIds && apiKeyIds.length > 0) {
    // Query all user's keys and merge results
    const allRows: Awaited<ReturnType<typeof aggregateReport>>["rows"] = [];
    let totalCount = 0;
    for (const kid of apiKeyIds) {
      const result = await aggregateReport({
        granularity: q.granularity,
        from: q.from,
        to: q.to,
        providerId: q.providerId,
        modelId: q.modelId,
        apiKeyId: kid,
        limit: 1000,
        offset: 0,
      });
      allRows.push(...result.rows);
      totalCount += result.total;
    }
    // Sort by period_start desc and apply pagination
    allRows.sort((a, b) => b.period_start - a.period_start);
    const paginated = allRows.slice(q.offset, q.offset + q.limit);
    return Response.json({ data: paginated, total: totalCount });
  }

  const result = await aggregateReport({
    granularity: q.granularity,
    from: q.from,
    to: q.to,
    providerId: q.providerId,
    modelId: q.modelId,
    apiKeyId: apiKeyId,
    limit: q.limit,
    offset: q.offset,
  });

  return Response.json({ data: result.rows, total: result.total });
}
