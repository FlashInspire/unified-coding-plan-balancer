import { prisma } from "@/lib/prisma";
import {
  type CreatedApiKey,
  generatePlaintext,
  sha256Hex,
} from "@/lib/auth/apiKey";
import type { ApiKeyRow } from "@/lib/types";

export interface ApiKeyPatch {
  name?: string;
  enabled?: boolean;
  ownerId?: string;
}

export const apiKeyRepo = {
  async list(ownerId?: string | null): Promise<ApiKeyRow[]> {
    const where = ownerId !== undefined ? { ownerId } : undefined;
    return prisma.apiKey.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { id: true, username: true, displayName: true } },
      },
    }) as unknown as ApiKeyRow[];
  },

  async findById(id: string): Promise<ApiKeyRow | null> {
    return prisma.apiKey.findUnique({ where: { id } });
  },

  /** Return just the IDs of keys owned by a given user (for metrics filtering). */
  async findIdsByOwner(ownerId: string): Promise<string[]> {
    const rows = await prisma.apiKey.findMany({
      where: { ownerId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  },

  async create(name: string, ownerId: string): Promise<CreatedApiKey> {
    const plaintext = generatePlaintext();
    const keyHash = sha256Hex(plaintext);
    const row = await prisma.apiKey.create({
      data: {
        name,
        keyHash,
        ownerId,
        enabled: true,
      },
    });
    return { id: row.id, name: row.name, plaintext };
  },

  async setEnabled(id: string, enabled: boolean): Promise<ApiKeyRow> {
    return prisma.apiKey.update({ where: { id }, data: { enabled } });
  },

  async update(id: string, patch: ApiKeyPatch): Promise<ApiKeyRow> {
    return prisma.apiKey.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.ownerId !== undefined ? { ownerId: patch.ownerId } : {}),
      },
    });
  },

  async delete(id: string): Promise<void> {
    await prisma.apiKey.delete({ where: { id } });
  },

  /**
   * Regenerate the plaintext secret for an existing API key.
   * Returns the new plaintext (only available at this moment) along with id/name.
   */
  async regenerate(id: string): Promise<CreatedApiKey> {
    const plaintext = generatePlaintext();
    const keyHash = sha256Hex(plaintext);
    const row = await prisma.apiKey.update({
      where: { id },
      data: { keyHash },
    });
    return { id: row.id, name: row.name, plaintext };
  },

  /** Bulk increment per-dimension token counters for API keys (called by cron flusher). */
  async flushDimensionIncrements(
    increments: Map<
      string,
      {
        inputTokens: number;
        cachedReadTokens: number;
        outputTokens: number;
      }
    >,
  ): Promise<void> {
    for (const [apiKeyId, dims] of increments) {
      if (
        dims.inputTokens <= 0 &&
        dims.cachedReadTokens <= 0 &&
        dims.outputTokens <= 0
      )
        continue;
      await prisma.$executeRaw`
        UPDATE ApiKey
        SET rollingInputTokensUsed      = rollingInputTokensUsed + ${dims.inputTokens},
            rollingCachedReadTokensUsed = rollingCachedReadTokensUsed + ${dims.cachedReadTokens},
            rollingOutputTokensUsed     = rollingOutputTokensUsed + ${dims.outputTokens},
            weekInputTokensUsed         = weekInputTokensUsed + ${dims.inputTokens},
            weekCachedReadTokensUsed    = weekCachedReadTokensUsed + ${dims.cachedReadTokens},
            weekOutputTokensUsed        = weekOutputTokensUsed + ${dims.outputTokens},
            monthInputTokensUsed        = monthInputTokensUsed + ${dims.inputTokens},
            monthCachedReadTokensUsed   = monthCachedReadTokensUsed + ${dims.cachedReadTokens},
            monthOutputTokensUsed       = monthOutputTokensUsed + ${dims.outputTokens},
            lastUsedAt                  = NOW()
        WHERE id = ${apiKeyId}
      `;
    }
  },
};
