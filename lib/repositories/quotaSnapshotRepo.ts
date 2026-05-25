import { prisma } from "@/lib/prisma";
import type { ProviderQuotaSnapshotRow } from "@/lib/types";

export const quotaSnapshotRepo = {
  async list(): Promise<ProviderQuotaSnapshotRow[]> {
    return prisma.providerQuotaSnapshot.findMany();
  },

  async upsert(
    providerId: string,
    usagePercent: number | null,
  ): Promise<ProviderQuotaSnapshotRow> {
    const payload = {
      usagePercent,
      healthy: true,
      fetchedAt: new Date(),
    };
    return prisma.providerQuotaSnapshot.upsert({
      where: { providerId },
      create: { providerId, ...payload },
      update: payload,
    });
  },
};
