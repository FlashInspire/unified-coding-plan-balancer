import { env } from "@/lib/env";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/lib/types";

export const adminUserRepo = {
  async count(): Promise<number> {
    return prisma.adminUser.count();
  },

  async findAll() {
    return prisma.adminUser.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        mustChangePassword: true,
        lastSignInAt: true,
        createdAt: true,
        rollingQuota: true,
        weekQuota: true,
        monthQuota: true,
        rollingInputTokensUsed: true,
        rollingCachedReadTokensUsed: true,
        rollingOutputTokensUsed: true,
        weekInputTokensUsed: true,
        weekCachedReadTokensUsed: true,
        weekOutputTokensUsed: true,
        monthInputTokensUsed: true,
        monthCachedReadTokensUsed: true,
        monthOutputTokensUsed: true,
        rollingQuotaResetAt: true,
        weekQuotaResetAt: true,
        monthQuotaResetAt: true,
        quotaMultiplierInput: true,
        quotaMultiplierCachedRead: true,
        quotaMultiplierOutput: true,
      },
      orderBy: { username: "asc" },
    });
  },

  async findById(id: string) {
    return prisma.adminUser.findUnique({ where: { id } });
  },

  async findByUsername(username: string) {
    return prisma.adminUser.findUnique({ where: { username } });
  },

  async create(
    username: string,
    plainPassword: string,
    opts?: {
      role?: UserRole;
      email?: string | null;
      displayName?: string | null;
      avatarUrl?: string | null;
    },
  ) {
    const passwordHash = await hashPassword(plainPassword);
    return prisma.adminUser.create({
      data: {
        username,
        passwordHash,
        role: opts?.role ?? "user",
        email: opts?.email ?? null,
        displayName: opts?.displayName ?? null,
        avatarUrl: opts?.avatarUrl ?? null,
        mustChangePassword: true,
      },
    });
  },

  async updatePassword(id: string, plainPassword: string) {
    const passwordHash = await hashPassword(plainPassword);
    return prisma.adminUser.update({
      where: { id },
      data: { passwordHash, mustChangePassword: false },
    });
  },

  /** Self-edit: displayName, email, avatarUrl (no role change). */
  async updateProfile(
    id: string,
    data: {
      email?: string | null;
      displayName?: string | null;
      avatarUrl?: string | null;
    },
  ) {
    const update: Record<string, unknown> = {};
    if (data.email !== undefined) update.email = data.email;
    if (data.displayName !== undefined) update.displayName = data.displayName;
    if (data.avatarUrl !== undefined) update.avatarUrl = data.avatarUrl;
    return prisma.adminUser.update({ where: { id }, data: update });
  },

  /** Admin-only: change a user's role. */
  async updateRole(id: string, role: UserRole) {
    return prisma.adminUser.update({ where: { id }, data: { role } });
  },

  async setMustChangePassword(id: string, value: boolean) {
    return prisma.adminUser.update({
      where: { id },
      data: { mustChangePassword: value },
    });
  },

  async updateLastSignIn(id: string): Promise<void> {
    await prisma.adminUser.update({
      where: { id },
      data: { lastSignInAt: new Date() },
    });
  },

  async delete(id: string): Promise<void> {
    await prisma.adminUser.delete({ where: { id } });
  },

  // ── Quota management ──────────────────────────────────────────

  /** Update user-level quota settings (admin only). */
  async updateQuota(
    id: string,
    quota: {
      rollingQuota?: number | null;
      weekQuota?: number | null;
      monthQuota?: number | null;
      quotaMultiplierInput?: number;
      quotaMultiplierCachedRead?: number;
      quotaMultiplierOutput?: number;
    },
  ) {
    const data: Record<string, unknown> = {};
    if (quota.rollingQuota !== undefined)
      data.rollingQuota = quota.rollingQuota;
    if (quota.weekQuota !== undefined) data.weekQuota = quota.weekQuota;
    if (quota.monthQuota !== undefined) data.monthQuota = quota.monthQuota;
    if (quota.quotaMultiplierInput !== undefined)
      data.quotaMultiplierInput = quota.quotaMultiplierInput;
    if (quota.quotaMultiplierCachedRead !== undefined)
      data.quotaMultiplierCachedRead = quota.quotaMultiplierCachedRead;
    if (quota.quotaMultiplierOutput !== undefined)
      data.quotaMultiplierOutput = quota.quotaMultiplierOutput;
    return prisma.adminUser.update({ where: { id }, data });
  },

  /** Bulk increment per-dimension token counters for users (called by cron flusher). */
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
    for (const [userId, dims] of increments) {
      if (
        dims.inputTokens <= 0 &&
        dims.cachedReadTokens <= 0 &&
        dims.outputTokens <= 0
      )
        continue;
      await prisma.$executeRaw`
        UPDATE AdminUser
        SET rollingInputTokensUsed      = rollingInputTokensUsed + ${dims.inputTokens},
            rollingCachedReadTokensUsed = rollingCachedReadTokensUsed + ${dims.cachedReadTokens},
            rollingOutputTokensUsed     = rollingOutputTokensUsed + ${dims.outputTokens},
            weekInputTokensUsed         = weekInputTokensUsed + ${dims.inputTokens},
            weekCachedReadTokensUsed    = weekCachedReadTokensUsed + ${dims.cachedReadTokens},
            weekOutputTokensUsed        = weekOutputTokensUsed + ${dims.outputTokens},
            monthInputTokensUsed        = monthInputTokensUsed + ${dims.inputTokens},
            monthCachedReadTokensUsed   = monthCachedReadTokensUsed + ${dims.cachedReadTokens},
            monthOutputTokensUsed       = monthOutputTokensUsed + ${dims.outputTokens}
        WHERE id = ${userId}
      `;
    }
  },

  /**
   * Idempotent: create the default admin (from env) only when no admins exist.
   * Safe to call from process bootstrap.
   */
  async ensureSeed(): Promise<void> {
    const n = await this.count();
    if (n > 0) return;
    await this.create(env.ADMIN_INIT_USERNAME, env.ADMIN_INIT_PASSWORD, {
      role: "admin",
    });

    console.log(
      `[ucpb] Created initial admin "${env.ADMIN_INIT_USERNAME}" — please log in and change the password.`,
    );
  },
};
