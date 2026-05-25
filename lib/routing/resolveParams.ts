import type {
  ApiMode,
  ModelRow,
  ProviderModelRow,
  ProviderRow,
  ReasoningEffort,
  ResolvedParams,
  UserOverrides,
} from "@/lib/types";

function asReasoningEffort(
  v: string | null | undefined,
): ReasoningEffort | null {
  if (v === "low" || v === "medium" || v === "high") return v;
  return null;
}

/**
 * Three-layer precedence: userOverrides > providerModel.*Override > model.*
 *
 * Non-overridable fields (context_length, real_model_id) skip the user layer.
 * max_tokens is capped to min(user, providerModel.maxTokensOverride ?? model.maxTokens).
 * apiMode is NOT resolved here — it is determined by the incoming endpoint (ctx.apiModeIn).
 */
export function resolveModelParams(
  model: ModelRow,
  provider: ProviderRow,
  pm: ProviderModelRow,
  user: UserOverrides = {},
): ResolvedParams {
  const maxTokensCap = pm.maxTokensOverride ?? model.maxTokens;
  const userMax = user.maxTokens ?? null;
  const finalMax =
    userMax == null
      ? maxTokensCap
      : Math.max(1, Math.min(userMax, maxTokensCap));

  return {
    // Not user-overridable
    contextLength: pm.contextLengthOverride ?? model.contextLength,
    realModelId: pm.realModelId,

    maxTokens: finalMax,

    temperature:
      user.temperature ?? pm.temperatureOverride ?? model.temperature,
    topP: user.topP ?? pm.topPOverride ?? model.topP,
    topK: user.topK ?? pm.topKOverride ?? model.topK,

    reasoningEffort:
      asReasoningEffort(user.reasoningEffort) ??
      asReasoningEffort(pm.reasoningEffortOverride) ??
      asReasoningEffort(model.reasoningEffort),

    includeReasoning:
      user.includeReasoning ??
      pm.includeReasoningInRequestOverride ??
      model.includeReasoningInRequest,
  };
}
