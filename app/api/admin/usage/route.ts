import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAdmin } from "../_lib/guard";
import { usageInMonth } from "@/lib/metrics/queryRouter";

const querySchema = z.object({
  month: z.string().optional(), // YYYY-MM, defaults to current month
});

export async function GET(req: NextRequest): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const q = querySchema.parse(Object.fromEntries(sp.entries()));
  const rows = usageInMonth(q.month);
  return Response.json({ data: rows });
}
