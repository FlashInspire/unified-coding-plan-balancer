/**
 * GET /api/admin/api-keys/[id]/usage — per-key token usage summary.
 *
 * Query params:
 *   period = "day" | "week" | "month" (default "day")
 *   months = number of months to look back (default 3)
 */
import { type NextRequest } from "next/server";
import { requireAdmin } from "../../../_lib/guard";
import { apiKeyTokenUsageMultiMonth } from "@/lib/metrics/queryRouter";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const url = new URL(req.url);
  const period = (url.searchParams.get("period") ?? "day") as
    | "day"
    | "week"
    | "month";
  const months = Math.max(
    1,
    Math.min(12, Number(url.searchParams.get("months")) || 3),
  );

  const data = apiKeyTokenUsageMultiMonth(id, period, months);
  return Response.json({ data });
}
