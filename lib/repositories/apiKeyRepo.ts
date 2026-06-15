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
      },
    });
  },

  async delete(id: string): Promise<void> {
    await prisma.apiKey.delete({ where: { id } });
  },

};
