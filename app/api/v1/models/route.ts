/**
 * GET /v1/models — model listing.
 *
 * Returns OpenAI-shaped response by default. If the client looks like an
 * Anthropic SDK (sends `x-api-key` or `anthropic-version` header), returns
 * Anthropic-shaped response per https://docs.anthropic.com/en/api/models-list.
 */
import { extractApiKey, verifyApiKey } from "@/lib/auth/apiKey";
import { providerModelRepo } from "@/lib/repositories/providerModelRepo";
import { modelRepo } from "@/lib/repositories/modelRepo";
import { ensureBoot } from "@/lib/boot";

function isAnthropicClient(req: Request): boolean {
  return (
    req.headers.get("x-api-key") != null ||
    req.headers.get("anthropic-version") != null
  );
}

export async function GET(req: Request): Promise<Response> {
  await ensureBoot();
  // Accept both `Authorization: Bearer` (OpenAI) and `x-api-key` (Anthropic).
  const apiKey = extractApiKey(req);
  if (!apiKey) return jsonErr(401, "Missing Authorization header");
  const key = await verifyApiKey(apiKey);
  if (!key) return jsonErr(401, "Invalid API key");

  const url = new URL(req.url);
  const providerParam = url.searchParams.get("provider");

  const ids = providerParam
    ? await providerModelRepo.modelIdsForProvider(providerParam)
    : await providerModelRepo.distinctEnabledModelIds();

  // Fetch full model rows
  const modelRows = await Promise.all(ids.map((id) => modelRepo.findById(id)));

  if (isAnthropicClient(req)) {
    // Anthropic shape: { data: [{ type, id, display_name, created_at }], has_more, first_id, last_id }
    // created_at must be ISO 8601 — we don't track creation, so use epoch.
    const epoch = new Date(0).toISOString();
    const data = modelRows
      .filter((m): m is NonNullable<typeof m> => m != null)
      .map((m) => ({
        type: "model" as const,
        id: m.id,
        display_name: m.displayName,
        created_at: epoch,
      }));
    return Response.json({
      data,
      has_more: false,
      first_id: data[0]?.id ?? null,
      last_id: data[data.length - 1]?.id ?? null,
    });
  }

  // OpenAI shape (default)
  const data = modelRows.map((m) => {
    const item: Record<string, unknown> = {
      id: m?.id ?? "unknown",
      object: "model",
      created: 0,
      owned_by: "unified-coding-plan-balancer",
    };
    if (m) {
      item.displayName = m.displayName;
      item.name = m.displayName;
      const input_modalities: string[] = ["text"];
      if (m.vision) input_modalities.push("image");
      item.architecture = { input_modalities };
      item.context_length = m.contextLength;
      item.max_tokens = m.maxTokens;
      item.vision = m.vision;
      if (m.temperature !== null && m.temperature !== undefined)
        item.temperature = m.temperature;
      if (m.topP != null) item.top_p = m.topP;
      if (m.topK != null) item.top_k = m.topK;
      if (m.minP != null) item.min_p = m.minP;
      if (m.frequencyPenalty != null)
        item.frequency_penalty = m.frequencyPenalty;
      if (m.presencePenalty != null) item.presence_penalty = m.presencePenalty;
      if (m.repetitionPenalty != null)
        item.repetition_penalty = m.repetitionPenalty;
      if (m.reasoningEffort != null) item.reasoning_effort = m.reasoningEffort;
      if (m.enableThinking != null) item.enable_thinking = m.enableThinking;
      if (m.thinkingBudget != null) item.thinking_budget = m.thinkingBudget;
      item.include_reasoning_in_request = m.includeReasoningInRequest;
    }
    return item;
  });
  return Response.json({ object: "list", data });
}

function jsonErr(status: number, message: string): Response {
  return Response.json({ error: { message, type: "error" } }, { status });
}
