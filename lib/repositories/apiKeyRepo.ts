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
  rollingQuota?: number | null;
  weekQuota?: number | null;
  monthQuota?: number | null;
}

export const apiKeyRepo = {
  async list(ownerId?: string | null): Promise<ApiKeyRow[]> {
    const where = ownerId !== undefined ? { ownerId } : undefined;
    return prisma.apiKey.findMany({ where, orderBy: { createdAt: "desc" } });
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

  async create(
    name: string,
    quota?: {
      rollingQuota?: number | null;
      weekQuota?: number | null;
      monthQuota?: number | null;
    },
    ownerId?: string | null,
  ): Promise<CreatedApiKey> {
    const plaintext = generatePlaintext();
    const keyHash = sha256Hex(plaintext);
    const row = await prisma.apiKey.create({
      data: {
        name,
        keyHash,
        ownerId: ownerId ?? null,
        enabled: true,
        rollingQuota: quota?.rollingQuota ?? null,
        weekQuota: quota?.weekQuota ?? null,
        monthQuota: quota?.monthQuota ?? null,
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
        ...(patch.rollingQuota !== undefined
          ? { rollingQuota: patch.rollingQuota }
          : {}),
        ...(patch.weekQuota !== undefined
          ? { weekQuota: patch.weekQuota }
          : {}),
        ...(patch.monthQuota !== undefined
          ? { monthQuota: patch.monthQuota }
          : {}),
      },
    });
  },

  async delete(id: string): Promise<void> {
    await prisma.apiKey.delete({ where: { id } });
  },

  /** Atomic increment of tokensUsed for a key. */
  async incrementTokensUsed(id: string, tokens: number): Promise<void> {
    if (tokens <= 0) return;
    await prisma.$executeRaw`
      UPDATE ApiKey SET tokensUsed = tokensUsed + ${tokens} WHERE id = ${id}
    `;
  },

  /** Bulk increment: receives a map of keyId → tokens to add. */
  async flushTokenIncrements(increments: Map<string, number>): Promise<void> {
    for (const [keyId, tokens] of increments) {
      if (tokens <= 0) continue;
      await prisma.$executeRaw`
        UPDATE ApiKey SET tokensUsed = tokensUsed + ${tokens} WHERE id = ${keyId}
      `;
    }
  },

  /** Reset tokensUsed to 0 for a key. */
  async resetTokensUsed(id: string): Promise<void> {
    await prisma.apiKey.update({
      where: { id },
      data: { tokensUsed: 0 },
    });
  },

  /** Update a single quota reset timestamp field. */
  async updateQuotaResetAt(
    id: string,
    field: "rollingQuotaResetAt" | "weekQuotaResetAt" | "monthQuotaResetAt",
    value: Date | null,
  ): Promise<void> {
    await prisma.apiKey.update({
      where: { id },
      data: { [field]: value },
    });
  },
};
