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
  rollingHourOffset?: number;
  usageMode?: string;
  enabled?: boolean;
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
  rollingHourOffset?: number;
  usageMode?: string;
  enabled?: boolean;
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
        rollingHourOffset: input.rollingHourOffset ?? 0,
        usageMode: input.usageMode ?? "request",
        enabled: input.enabled ?? true,
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
        ...(patch.rollingHourOffset !== undefined
          ? { rollingHourOffset: patch.rollingHourOffset }
          : {}),
        ...(patch.usageMode !== undefined
          ? { usageMode: patch.usageMode }
          : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
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

  async incrementQuotaUsedByTokens(
    id: string,
    inputTokens: number,
    cachedInputTokens: number,
    outputTokens: number,
    feeRateInput: number,
    feeRateCachedInput: number,
    feeRateOutput: number,
  ): Promise<void> {
    const inputCost = inputTokens * feeRateInput;
    const cachedCost = cachedInputTokens * feeRateCachedInput;
    const outputCost = outputTokens * feeRateOutput;
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
