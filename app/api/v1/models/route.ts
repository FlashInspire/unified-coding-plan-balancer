/**
 * GET /v1/models — OpenAI-compatible model listing.
 * Returns deduplicated model_ids, regardless of provider.
 */
import { extractBearer, verifyApiKey } from "@/lib/auth/apiKey";
import { providerModelRepo } from "@/lib/repositories/providerModelRepo";
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
  const data = ids.map((id) => ({
    id,
    object: "model",
    created: 0,
    owned_by: "unified-coding-plan-balancer",
  }));
  return Response.json({ object: "list", data });
}

function jsonErr(status: number, message: string): Response {
  return Response.json({ error: { message, type: "error" } }, { status });
}
