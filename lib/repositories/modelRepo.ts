import { prisma } from "@/lib/prisma";
import type { ModelRow } from "@/lib/types";

export interface ModelInput {
  id: string;
  displayName: string;
  contextLength: number;
  maxTokens: number;
  temperature?: number | null;
  topP?: number | null;
  topK?: number | null;
  minP?: number | null;
  frequencyPenalty?: number | null;
  presencePenalty?: number | null;
  repetitionPenalty?: number | null;
  reasoningEffort?: string | null;
  includeReasoningInRequest?: boolean;
  vision?: boolean;
  enableThinking?: boolean | null;
  thinkingBudget?: number | null;
  enabled?: boolean;
}

export type ModelPatch = Partial<Omit<ModelInput, "id">>;

export const modelRepo = {
  async list(): Promise<ModelRow[]> {
    return prisma.model.findMany({ orderBy: { displayName: "asc" } });
  },
  async findById(id: string): Promise<ModelRow | null> {
    return prisma.model.findUnique({ where: { id } });
  },
  async create(input: ModelInput): Promise<ModelRow> {
    return prisma.model.create({
      data: {
        id: input.id,
        displayName: input.displayName,
        contextLength: input.contextLength,
        maxTokens: input.maxTokens,
        temperature: input.temperature ?? null,
        topP: input.topP ?? null,
        topK: input.topK ?? null,
        minP: input.minP ?? null,
        frequencyPenalty: input.frequencyPenalty ?? null,
        presencePenalty: input.presencePenalty ?? null,
        repetitionPenalty: input.repetitionPenalty ?? null,
        reasoningEffort: input.reasoningEffort ?? null,
        includeReasoningInRequest: input.includeReasoningInRequest ?? false,
        vision: input.vision ?? false,
        enableThinking: input.enableThinking ?? null,
        thinkingBudget: input.thinkingBudget ?? null,
        enabled: input.enabled ?? true,
      },
    });
  },
  async update(id: string, patch: ModelPatch): Promise<ModelRow> {
    return prisma.model.update({ where: { id }, data: patch });
  },
  async delete(id: string): Promise<void> {
    await prisma.model.delete({ where: { id } });
  },
};
