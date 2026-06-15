import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAdmin } from "../../_lib/guard";
import { providerRepo } from "@/lib/repositories/providerRepo";
import { resetQuotaRetries } from "@/lib/routing/selectCandidate";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  baseUrlOpenai: z.string().url().nullable().optional(),
  apiKeyOpenai: z.string().min(1).nullable().optional(),
  baseUrlAnthropic: z.string().url().nullable().optional(),
  apiKeyAnthropic: z.string().min(1).nullable().optional(),
  headersTemplate: z.record(z.string(), z.string()).optional(),
  rollingQuota: z.number().int().nullable().optional(),
  weekQuota: z.number().int().nullable().optional(),
  monthQuota: z.number().int().nullable().optional(),
  rollingQuotaUsed: z.number().int().optional(),
  weekQuotaUsed: z.number().int().optional(),
  monthQuotaUsed: z.number().int().optional(),
  rollingCacheInputTokensUsed: z.number().optional(),
  rollingOutputTokensUsed: z.number().optional(),
  weekCacheInputTokensUsed: z.number().optional(),
  weekOutputTokensUsed: z.number().optional(),
  monthCacheInputTokensUsed: z.number().optional(),
  monthOutputTokensUsed: z.number().optional(),
  planStartTime: z.coerce.date().nullable().optional(),
  usageMode: z.enum(["request", "token"]).optional(),
  weight: z.number().int().min(0).optional(),
  enabled: z.boolean().optional(),
  quotaRunningOut: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const row = await providerRepo.findById(id);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ data: row });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  try {
    const data = updateSchema.parse(await req.json());

    // When any quota counter is manually reset to 0, also clear the
    // quotaRunningOut flag so the provider becomes eligible for routing again.
    const quotaUsedFields = [
      "rollingQuotaUsed",
      "weekQuotaUsed",
      "monthQuotaUsed",
      "rollingCacheInputTokensUsed",
      "rollingOutputTokensUsed",
      "weekCacheInputTokensUsed",
      "weekOutputTokensUsed",
      "monthCacheInputTokensUsed",
      "monthOutputTokensUsed",
    ] as const;
    const anyQuotaReset = quotaUsedFields.some(
      (f) => f in data && data[f as keyof typeof data] === 0,
    );
    if (anyQuotaReset) {
      data.quotaRunningOut = false;
      resetQuotaRetries(id);
    }

    // When quotaRunningOut is explicitly cleared, also reset in-memory state.
    if (data.quotaRunningOut === false) {
      resetQuotaRetries(id);
    }

    const row = await providerRepo.update(id, data);
    return Response.json({ data: row });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  await providerRepo.delete(id);
  return Response.json({ ok: true });
}
