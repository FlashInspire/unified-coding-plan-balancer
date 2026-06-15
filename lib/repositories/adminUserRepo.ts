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
