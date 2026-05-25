import { prisma } from "@/lib/prisma";
import {
  type CreatedApiKey,
  generatePlaintext,
  sha256Hex,
} from "@/lib/auth/apiKey";
import type { ApiKeyRow } from "@/lib/types";

export const apiKeyRepo = {
  async list(): Promise<ApiKeyRow[]> {
    return prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } });
  },

  async create(name: string): Promise<CreatedApiKey> {
    const plaintext = generatePlaintext();
    const keyHash = sha256Hex(plaintext);
    const row = await prisma.apiKey.create({
      data: { name, keyHash, enabled: true },
    });
    return { id: row.id, name: row.name, plaintext };
  },

  async setEnabled(id: string, enabled: boolean): Promise<ApiKeyRow> {
    return prisma.apiKey.update({ where: { id }, data: { enabled } });
  },

  async delete(id: string): Promise<void> {
    await prisma.apiKey.delete({ where: { id } });
  },
};
