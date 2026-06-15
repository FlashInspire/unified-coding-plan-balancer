/**
 * POST /v1/embeddings — OpenAI-compatible embeddings endpoint.
 * Routes to the first available provider for the given model.
 * (Minimal implementation; full embedding support is a future enhancement.)
 */
import { z } from "zod";
import { extractBearer, verifyApiKey } from "@/lib/auth/apiKey";
import { resolveProvider } from "@/lib/adapters/base";
import { modelRepo } from "@/lib/repositories/modelRepo";
import { providerModelRepo } from "@/lib/repositories/providerModelRepo";
import { selectCandidates } from "@/lib/routing/selectCandidate";
import { userTokenBuffer } from "@/lib/quota/keyTokenBuffer";
import { ensureBoot } from "@/lib/boot";

const reqSchema = z.object({
  model: z.string().min(1),
  input: z.union([z.string(), z.array(z.string())]),
});

export async function POST(req: Request): Promise<Response> {
  await ensureBoot();
  const bearer = extractBearer(req);
  if (!bearer) return jsonErr(401, "Missing Authorization header");
  const key = await verifyApiKey(bearer);
  if (!key) return jsonErr(401, "Invalid API key");

  // Check user token quota.
  if (key.ownerId && userTokenBuffer.isQuotaExceeded(key.ownerId, 1)) {
    return jsonErr(429, `API key "${key.name}" token quota exceeded`);
  }

  let body: z.infer<typeof reqSchema>;
  try {
    body = reqSchema.parse(await req.json());
  } catch (e) {
    return jsonErr(
      400,
      e instanceof Error ? e.message : "Invalid request body",
    );
  }

  const model = await modelRepo.findById(body.model);
  if (!model || !model.enabled)
    return jsonErr(404, `Model "${body.model}" not found`);

  const candidates = await providerModelRepo.findCandidates(body.model);
  // Embeddings always use OpenAI protocol — filter to compatible candidates.
  const openaiCandidates = candidates.filter((c) => {
    if (c.pm.apiStyle === "anthropic") return false;
    return !!c.provider.baseUrlOpenai;
  });
  const sorted = selectCandidates(openaiCandidates);
  if (sorted.length === 0)
    return jsonErr(404, `No provider for model "${body.model}"`);

  const c = sorted[0];
  const provider = resolveProvider(c.provider, "openai");

  // Forward to upstream /embeddings endpoint
  const url = `${provider.baseUrl.replace(/\/+$/, "")}/embeddings`;
  const upstreamBody = { model: c.pm.realModelId, input: body.input };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
      ...provider.headers,
    },
    body: JSON.stringify(upstreamBody),
  });

  if (!res.ok) {
    const text = await res.text();
    return jsonErr(res.status, text.slice(0, 500));
  }
  const json = await res.json();
  return Response.json(json);
}

function jsonErr(status: number, message: string): Response {
  return Response.json({ error: { message, type: "error" } }, { status });
}
