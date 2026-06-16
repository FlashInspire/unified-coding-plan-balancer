import { prisma } from "@/lib/prisma";
import type { ProviderRow } from "@/lib/types";

export interface ProviderInput {
  id: string;
  name: string;
  baseUrlOpenai?: string | null;
  apiKeyOpenai?: string | null;
  baseUrlAnthropic?: string | null;
  apiKeyAnthropic?: string | null;
  headersTemplate?: Record<string, string>;
  rollingQuota?: number | null;
  weekQuota?: number | null;
  monthQuota?: number | null;
  rollingQuotaUsed?: number;
  weekQuotaUsed?: number;
  monthQuotaUsed?: number;
  planStartTime?: Date | null;
  usageMode?: string;
  enabled?: boolean;
  quotaRunningOut?: boolean;
}

export interface ProviderPatch {
  name?: string;
  baseUrlOpenai?: string | null;
  apiKeyOpenai?: string | null;
  baseUrlAnthropic?: string | null;
  apiKeyAnthropic?: string | null;
  headersTemplate?: Record<string, string>;
  rollingQuota?: number | null;
  weekQuota?: number | null;
  monthQuota?: number | null;
  rollingQuotaUsed?: number;
  weekQuotaUsed?: number;
  monthQuotaUsed?: number;
  rollingCacheInputTokensUsed?: number;
  rollingOutputTokensUsed?: number;
  weekCacheInputTokensUsed?: number;
  weekOutputTokensUsed?: number;
  monthCacheInputTokensUsed?: number;
  monthOutputTokensUsed?: number;
  planStartTime?: Date | null;
  usageMode?: string;
  enabled?: boolean;
  quotaRunningOut?: boolean;
}

/** Convert Prisma Provider (with BigInt quota) to ProviderRow (number-based for JSON serialization). */
function mapProviderRow(
  r: Omit<ProviderRow, "rollingQuota" | "weekQuota" | "monthQuota"> & {
    rollingQuota: bigint | null;
    weekQuota: bigint | null;
    monthQuota: bigint | null;
  },
): ProviderRow {
  return {
    ...r,
    rollingQuota: r.rollingQuota != null ? Number(r.rollingQuota) : null,
    weekQuota: r.weekQuota != null ? Number(r.weekQuota) : null,
    monthQuota: r.monthQuota != null ? Number(r.monthQuota) : null,
  };
}

export const providerRepo = {
  async list(): Promise<ProviderRow[]> {
    const rows = await prisma.provider.findMany({
      orderBy: { createdAt: "asc" },
    });
    return rows.map(mapProviderRow);
  },
  async listEnabled(): Promise<ProviderRow[]> {
    const rows = await prisma.provider.findMany({ where: { enabled: true } });
    return rows.map(mapProviderRow);
  },
  async findById(id: string): Promise<ProviderRow | null> {
    const row = await prisma.provider.findUnique({ where: { id } });
    return row ? mapProviderRow(row) : null;
  },
  async create(input: ProviderInput): Promise<ProviderRow> {
    const row = await prisma.provider.create({
      data: {
        id: input.id,
        name: input.name,
        baseUrlOpenai: input.baseUrlOpenai ?? null,
        apiKeyOpenai: input.apiKeyOpenai ?? null,
        baseUrlAnthropic: input.baseUrlAnthropic ?? null,
        apiKeyAnthropic: input.apiKeyAnthropic ?? null,
        headersTemplate: JSON.stringify(input.headersTemplate ?? {}),
        rollingQuota:
          input.rollingQuota != null ? BigInt(input.rollingQuota) : null,
        weekQuota: input.weekQuota != null ? BigInt(input.weekQuota) : null,
        monthQuota: input.monthQuota != null ? BigInt(input.monthQuota) : null,
        rollingQuotaUsed: input.rollingQuotaUsed ?? 0,
        weekQuotaUsed: input.weekQuotaUsed ?? 0,
        monthQuotaUsed: input.monthQuotaUsed ?? 0,
        planStartTime: input.planStartTime ?? null,
        usageMode: input.usageMode ?? "request",
        enabled: input.enabled ?? true,
        quotaRunningOut: input.quotaRunningOut ?? false,
      },
    });
    return mapProviderRow(row);
  },
  async update(id: string, patch: ProviderPatch): Promise<ProviderRow> {
    const row = await prisma.provider.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.baseUrlOpenai !== undefined
          ? { baseUrlOpenai: patch.baseUrlOpenai }
          : {}),
        ...(patch.apiKeyOpenai !== undefined
          ? { apiKeyOpenai: patch.apiKeyOpenai }
          : {}),
        ...(patch.baseUrlAnthropic !== undefined
          ? { baseUrlAnthropic: patch.baseUrlAnthropic }
          : {}),
        ...(patch.apiKeyAnthropic !== undefined
          ? { apiKeyAnthropic: patch.apiKeyAnthropic }
          : {}),
        ...(patch.headersTemplate !== undefined
          ? { headersTemplate: JSON.stringify(patch.headersTemplate) }
          : {}),
        ...(patch.rollingQuota !== undefined
          ? {
              rollingQuota:
                patch.rollingQuota != null ? BigInt(patch.rollingQuota) : null,
            }
          : {}),
        ...(patch.weekQuota !== undefined
          ? {
              weekQuota:
                patch.weekQuota != null ? BigInt(patch.weekQuota) : null,
            }
          : {}),
        ...(patch.monthQuota !== undefined
          ? {
              monthQuota:
                patch.monthQuota != null ? BigInt(patch.monthQuota) : null,
            }
          : {}),
        ...(patch.rollingQuotaUsed !== undefined
          ? { rollingQuotaUsed: patch.rollingQuotaUsed }
          : {}),
        ...(patch.weekQuotaUsed !== undefined
          ? { weekQuotaUsed: patch.weekQuotaUsed }
          : {}),
        ...(patch.monthQuotaUsed !== undefined
          ? { monthQuotaUsed: patch.monthQuotaUsed }
          : {}),
        ...(patch.rollingCacheInputTokensUsed !== undefined
          ? { rollingCacheInputTokensUsed: patch.rollingCacheInputTokensUsed }
          : {}),
        ...(patch.rollingOutputTokensUsed !== undefined
          ? { rollingOutputTokensUsed: patch.rollingOutputTokensUsed }
          : {}),
        ...(patch.weekCacheInputTokensUsed !== undefined
          ? { weekCacheInputTokensUsed: patch.weekCacheInputTokensUsed }
          : {}),
        ...(patch.weekOutputTokensUsed !== undefined
          ? { weekOutputTokensUsed: patch.weekOutputTokensUsed }
          : {}),
        ...(patch.monthCacheInputTokensUsed !== undefined
          ? { monthCacheInputTokensUsed: patch.monthCacheInputTokensUsed }
          : {}),
        ...(patch.monthOutputTokensUsed !== undefined
          ? { monthOutputTokensUsed: patch.monthOutputTokensUsed }
          : {}),
        ...(patch.planStartTime !== undefined
          ? { planStartTime: patch.planStartTime }
          : {}),
        ...(patch.usageMode !== undefined
          ? { usageMode: patch.usageMode }
          : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.quotaRunningOut !== undefined
          ? { quotaRunningOut: patch.quotaRunningOut }
          : {}),
      },
    });
    return mapProviderRow(row);
  },
  async delete(id: string): Promise<void> {
    await prisma.provider.delete({ where: { id } });
  },

  async incrementQuotaUsedByRequest(id: string, amount: number): Promise<void> {
    await prisma.$executeRaw`
      UPDATE Provider
      SET rollingQuotaUsed = rollingQuotaUsed + ${amount},
          weekQuotaUsed    = weekQuotaUsed + ${amount},
          monthQuotaUsed   = monthQuotaUsed + ${amount}
      WHERE id = ${id}
    `;
  },

  /**
   * Increment provider quota counters by pre-computed fee costs.
   *
   * @param inputCost   Weighted cost for input tokens
   * @param cachedCost  Weighted cost for cached read + cache write tokens
   * @param outputCost  Weighted cost for output tokens
   */
  async incrementQuotaUsedByTokens(
    id: string,
    inputCost: number,
    cachedCost: number,
    outputCost: number,
  ): Promise<void> {
    await prisma.$executeRaw`
      UPDATE Provider
      SET rollingQuotaUsed            = rollingQuotaUsed + ${inputCost},
          rollingCacheInputTokensUsed = rollingCacheInputTokensUsed + ${cachedCost},
          rollingOutputTokensUsed     = rollingOutputTokensUsed + ${outputCost},
          weekQuotaUsed               = weekQuotaUsed + ${inputCost},
          weekCacheInputTokensUsed    = weekCacheInputTokensUsed + ${cachedCost},
          weekOutputTokensUsed        = weekOutputTokensUsed + ${outputCost},
          monthQuotaUsed              = monthQuotaUsed + ${inputCost},
          monthCacheInputTokensUsed   = monthCacheInputTokensUsed + ${cachedCost},
          monthOutputTokensUsed       = monthOutputTokensUsed + ${outputCost}
      WHERE id = ${id}
    `;
  },
};
