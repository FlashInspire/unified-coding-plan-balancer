/**
 * GET /v1/models — OpenAI-compatible model listing.
 * Returns deduplicated model_ids with extra_options containing all
 * configured model settings (non-null values only).
 */
import { extractBearer, verifyApiKey } from "@/lib/auth/apiKey";
import { providerModelRepo } from "@/lib/repositories/providerModelRepo";
import { modelRepo } from "@/lib/repositories/modelRepo";
import { ensureBoot } from "@/lib/boot";

export async function GET(req: Request): Promise<Response> {
  await ensureBoot();
  const bearer = extractBearer(req);
  if (!bearer) return jsonErr(401, "Missing Authorization header");
  const key = await verifyApiKey(bearer);
  if (!key) return jsonErr(401, "Invalid API key");

  const url = new URL(req.url);
  const providerParam = url.searchParams.get("provider");

  const ids = providerParam
    ? await providerModelRepo.modelIdsForProvider(providerParam)
    : await providerModelRepo.distinctEnabledModelIds();

  // Fetch full model rows to build extra_options
  const modelRows = await Promise.all(ids.map((id) => modelRepo.findById(id)));

  const data = modelRows.map((m) => {
    const extra: Record<string, unknown> = {};
    if (m) {
      if (m.vision !== undefined) extra.vision = m.vision;
      if (m.maxTokens !== undefined) extra.max_tokens = m.maxTokens;
      if (m.contextLength !== undefined) extra.context_length = m.contextLength;
      if (m.topP != null) extra.top_p = m.topP;
      if (m.topK != null) extra.top_k = m.topK;
      if (m.minP != null) extra.min_p = m.minP;
      if (m.frequencyPenalty != null)
        extra.frequency_penalty = m.frequencyPenalty;
      if (m.presencePenalty != null) extra.presence_penalty = m.presencePenalty;
      if (m.repetitionPenalty != null)
        extra.repetition_penalty = m.repetitionPenalty;
      if (m.enableThinking != null) extra.enable_thinking = m.enableThinking;
      if (m.thinkingBudget != null) extra.thinking_budget = m.thinkingBudget;
      if (m.reasoningEffort != null) extra.reasoning_effort = m.reasoningEffort;
      if (m.includeReasoningInRequest !== undefined)
        extra.include_reasoning_in_request = m.includeReasoningInRequest;
    }
    return {
      id: m?.id ?? "unknown",
      object: "model",
      created: 0,
      owned_by: "unified-coding-plan-balancer",
      extra_options: extra,
    };
  });
  return Response.json({ object: "list", data });
}

function jsonErr(status: number, message: string): Response {
  return Response.json({ error: { message, type: "error" } }, { status });
}
