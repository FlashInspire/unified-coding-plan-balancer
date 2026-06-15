import { prisma } from "@/lib/prisma";
import type {
  ProviderApiStyle,
  ProviderModelRow,
  ProviderRow,
} from "@/lib/types";
import { activeRequests } from "@/lib/routing/activeRequests";

export interface ProviderModelInput {
  modelId: string;
  providerId: string;
  realModelId?: string | null;
  contextLengthOverride?: number | null;
  maxTokensOverride?: number | null;
  temperatureOverride?: number | null;
  topPOverride?: number | null;
  topKOverride?: number | null;
  reasoningEffortOverride?: string | null;
  includeReasoningInRequestOverride?: boolean | null;
  weight?: number;
  apiStyle?: ProviderApiStyle;
  feeRateInput?: number;
  feeRateCachedInput?: number;
  feeRateOutput?: number;
  enabled?: boolean;
}

export type ProviderModelPatch = Partial<
  Omit<ProviderModelInput, "modelId" | "providerId">
>;

/** Candidate row used by the router: ProviderModel joined with its Provider and quota snapshot. */
export interface RoutingCandidate {
  pm: ProviderModelRow;
  provider: ProviderRow;
  usagePercent: number | null;
  healthy: boolean;
  activeRequests: number;
}

export const providerModelRepo = {
  async list(): Promise<ProviderModelRow[]> {
    return prisma.providerModel.findMany({ orderBy: { modelId: "asc" } });
  },
  async findById(id: string): Promise<ProviderModelRow | null> {
    return prisma.providerModel.findUnique({ where: { id } });
  },
  async create(input: ProviderModelInput): Promise<ProviderModelRow> {
    return prisma.providerModel.create({
      data: {
        modelId: input.modelId,
        providerId: input.providerId,
        realModelId: input.realModelId ?? null,
        contextLengthOverride: input.contextLengthOverride ?? null,
        maxTokensOverride: input.maxTokensOverride ?? null,
        temperatureOverride: input.temperatureOverride ?? null,
        topPOverride: input.topPOverride ?? null,
        topKOverride: input.topKOverride ?? null,
        reasoningEffortOverride: input.reasoningEffortOverride ?? null,
        includeReasoningInRequestOverride:
          input.includeReasoningInRequestOverride ?? null,
        weight: input.weight ?? 1,
        apiStyle: input.apiStyle ?? "auto",
        feeRateInput: input.feeRateInput ?? 1.0,
        feeRateCachedInput: input.feeRateCachedInput ?? 0.1,
        feeRateOutput: input.feeRateOutput ?? 4.0,
        enabled: input.enabled ?? true,
      },
    });
  },
  async update(
    id: string,
    patch: ProviderModelPatch,
  ): Promise<ProviderModelRow> {
    return prisma.providerModel.update({ where: { id }, data: patch });
  },
  async delete(id: string): Promise<void> {
    await prisma.providerModel.delete({ where: { id } });
  },

  /** List distinct enabled model_ids for GET /v1/models. */
  async distinctEnabledModelIds(): Promise<string[]> {
    const rows = await prisma.providerModel.findMany({
      where: {
        enabled: true,
        provider: { enabled: true },
        model: { enabled: true },
      },
      select: { modelId: true },
      distinct: ["modelId"],
    });
    return rows.map((r) => r.modelId);
  },

  /** List model_ids for a specific provider (including disabled provider/pm). */
  async modelIdsForProvider(providerId: string): Promise<string[]> {
    const rows = await prisma.providerModel.findMany({
      where: { providerId },
      select: { modelId: true },
      distinct: ["modelId"],
    });
    return rows.map((r) => r.modelId);
  },

  /** Find all enabled candidates for routing a given model_id. */
  async findCandidates(modelId: string): Promise<RoutingCandidate[]> {
    const rows = await prisma.providerModel.findMany({
      where: {
        modelId,
        enabled: true,
        provider: {
          enabled: true,
        },
      },
      include: {
        provider: true,
      },
    });
    return rows.map((r) => {
      return {
        pm: stripProvider(r),
        provider: r.provider as unknown as ProviderRow,
        usagePercent: null,
        healthy: true,
        activeRequests: activeRequests.get(r.provider.id),
      };
    });
  },

  /**
   * Find a specific provider-model pair directly, bypassing enabled checks.
   * Used for `provider/model` direct routing.
   */
  async findDirect(
    providerId: string,
    modelId: string,
  ): Promise<RoutingCandidate | null> {
    const row = await prisma.providerModel.findFirst({
      where: { providerId, modelId },
      include: {
        provider: true,
      },
    });
    if (!row) return null;
    return {
      pm: stripProvider(row),
      provider: row.provider as unknown as ProviderRow,
      usagePercent: null,
      healthy: true,
      activeRequests: activeRequests.get(row.provider.id),
    };
  },
};

function stripProvider<T extends { provider?: unknown }>(
  row: T,
): ProviderModelRow {
  const { provider, ...rest } = row;
  void provider;
  return rest as unknown as ProviderModelRow;
}
