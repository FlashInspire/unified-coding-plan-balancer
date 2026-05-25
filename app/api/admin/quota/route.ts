import type { NextRequest } from "next/server";
import { requireAdmin } from "../_lib/guard";
import { quotaSnapshotRepo } from "@/lib/repositories/quotaSnapshotRepo";

export async function GET(req: NextRequest): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const list = await quotaSnapshotRepo.list();
  return Response.json({ data: list });
}
