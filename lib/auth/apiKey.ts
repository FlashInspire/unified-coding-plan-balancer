/**
 * External API Key generation, hashing, and verification.
 *
 * Plaintext format: "sk-y6-<32 base64url chars>"
 * Storage: sha256(plaintext) hex string in ApiKey.keyHash
 * The plaintext is returned exactly once at creation time.
 */
import { createHash, randomBytes } from "node:crypto";
import { API_KEY_PREFIX } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export interface CreatedApiKey {
  id: string;
  name: string;
  plaintext: string; // shown once, never persisted in cleartext
}

export interface VerifiedApiKey {
  id: string;
  name: string;
}

export function generatePlaintext(): string {
  // 24 random bytes → 32 base64url chars
  const rand = randomBytes(24).toString("base64url");
  return `${API_KEY_PREFIX}${rand}`;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Mask a key for display (keep first 4 after prefix and last 4). */
export function maskKey(plaintext: string): string {
  if (plaintext.length < 12) return "****";
  const body = plaintext.startsWith(API_KEY_PREFIX)
    ? plaintext.slice(API_KEY_PREFIX.length)
    : plaintext;
  const head = body.slice(0, 4);
  const tail = body.slice(-4);
  return `${API_KEY_PREFIX}${head}…${tail}`;
}

/**
 * Verify a Bearer token, returning the ApiKey row id+name on success.
 * Updates lastUsedAt asynchronously (fire-and-forget).
 */
export async function verifyApiKey(
  plaintext: string,
): Promise<VerifiedApiKey | null> {
  if (!plaintext.startsWith(API_KEY_PREFIX)) return null;
  const hash = sha256Hex(plaintext);
  const row = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    select: { id: true, name: true, enabled: true },
  });
  if (!row || !row.enabled) return null;

  // Fire-and-forget; not awaited so we don't block the request path.
  void prisma.apiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {
      /* swallow; metrics path is best-effort */
    });

  return { id: row.id, name: row.name };
}

/** Extract a Bearer token from a Request's Authorization header. */
export function extractBearer(req: Request): string | null {
  const h =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

/**
 * Extract API key from a Request, supporting both OpenAI-style
 * `Authorization: Bearer <key>` and Anthropic-style `x-api-key: <key>`.
 */
export function extractApiKey(req: Request): string | null {
  const bearer = extractBearer(req);
  if (bearer) return bearer;
  return req.headers.get("x-api-key")?.trim() || null;
}
