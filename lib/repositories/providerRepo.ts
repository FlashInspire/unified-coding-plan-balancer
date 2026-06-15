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

export const providerRepo = {
  async list(): Promise<ProviderRow[]> {
    return prisma.provider.findMany({ orderBy: { createdAt: "asc" } });
  },
  async listEnabled(): Promise<ProviderRow[]> {
    return prisma.provider.findMany({ where: { enabled: true } });
  },
  async findById(id: string): Promise<ProviderRow | null> {
    return prisma.provider.findUnique({ where: { id } });
  },
  async create(input: ProviderInput): Promise<ProviderRow> {
    return prisma.provider.create({
      data: {
        id: input.id,
        name: input.name,
        baseUrlOpenai: input.baseUrlOpenai ?? null,
        apiKeyOpenai: input.apiKeyOpenai ?? null,
        baseUrlAnthropic: input.baseUrlAnthropic ?? null,
        apiKeyAnthropic: input.apiKeyAnthropic ?? null,
        headersTemplate: JSON.stringify(input.headersTemplate ?? {}),
        rollingQuota: input.rollingQuota ?? null,
        weekQuota: input.weekQuota ?? null,
        monthQuota: input.monthQuota ?? null,
        rollingQuotaUsed: input.rollingQuotaUsed ?? 0,
        weekQuotaUsed: input.weekQuotaUsed ?? 0,
        monthQuotaUsed: input.monthQuotaUsed ?? 0,
        planStartTime: input.planStartTime ?? null,
        usageMode: input.usageMode ?? "request",
        enabled: input.enabled ?? true,
        quotaRunningOut: input.quotaRunningOut ?? false,
      },
    });
  },
  async update(id: string, patch: ProviderPatch): Promise<ProviderRow> {
    return prisma.provider.update({
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
          ? { rollingQuota: patch.rollingQuota }
          : {}),
        ...(patch.weekQuota !== undefined
          ? { weekQuota: patch.weekQuota }
          : {}),
        ...(patch.monthQuota !== undefined
          ? { monthQuota: patch.monthQuota }
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
