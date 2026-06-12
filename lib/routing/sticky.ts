/**
 * Key–ProviderModel sticky routing — database-backed.
 *
 * When a request succeeds, we record the (apiKeyId, modelId) → providerId
 * mapping in the StickyRoute table so that subsequent requests from the same
 * key for the same model are routed to the same provider, maximizing
 * KV-cache hit rates.
 *
 * Reads are cheap (composite PK lookup). Writes are upserts. Expired entries
 * are cleaned up lazily on read and by a periodic sweep.
 */

import { prisma } from "@/lib/prisma";

interface StickyResult {
  providerId: string;
  pmId: string;
}

/**
 * Look up the sticky provider for a given API key + model combo.
 * Returns null if no entry exists or if the entry has expired.
 * Silently deletes expired entries.
 */
export async function getStickyProvider(
  apiKeyId: string,
  modelId: string,
): Promise<StickyResult | null> {
  const row = await prisma.stickyRoute.findUnique({
    where: { apiKeyId_modelId: { apiKeyId, modelId } },
  });
  if (!row) return null;
  if (row.expiresAt < new Date()) {
    // Lazy cleanup — fire-and-forget
    prisma.stickyRoute
      .delete({ where: { apiKeyId_modelId: { apiKeyId, modelId } } })
      .catch(() => {});
    return null;
  }
  return { providerId: row.providerId, pmId: row.pmId };
}

/**
 * Record a successful dispatch: pin this (apiKeyId, modelId) → providerId
 * for the configured TTL.
 */
export async function setStickyProvider(
  apiKeyId: string,
  modelId: string,
  providerId: string,
  pmId: string,
  ttlMs: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs);
  await prisma.stickyRoute.upsert({
    where: { apiKeyId_modelId: { apiKeyId, modelId } },
    create: { apiKeyId, modelId, providerId, pmId, expiresAt },
    update: { providerId, pmId, expiresAt },
  });
}

/**
 * Remove a sticky entry.
 */
export async function clearStickyProvider(
  apiKeyId: string,
  modelId: string,
): Promise<void> {
  await prisma.stickyRoute
    .delete({ where: { apiKeyId_modelId: { apiKeyId, modelId } } })
    .catch(() => {});
}

/**
 * Delete all expired sticky routes. Call periodically (e.g. from a worker).
 * Returns the number of deleted rows.
 */
export async function purgeExpiredStickyRoutes(): Promise<number> {
  const result = await prisma.stickyRoute.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
