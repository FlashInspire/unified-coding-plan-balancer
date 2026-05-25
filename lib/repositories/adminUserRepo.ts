import { env } from "@/lib/env";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

export const adminUserRepo = {
  async count(): Promise<number> {
    return prisma.adminUser.count();
  },

  async findByUsername(username: string) {
    return prisma.adminUser.findUnique({ where: { username } });
  },

  async create(username: string, plainPassword: string) {
    const passwordHash = await hashPassword(plainPassword);
    return prisma.adminUser.create({
      data: { username, passwordHash },
    });
  },

  async updatePassword(id: string, plainPassword: string) {
    const passwordHash = await hashPassword(plainPassword);
    return prisma.adminUser.update({
      where: { id },
      data: { passwordHash },
    });
  },

  /**
   * Idempotent: create the default admin (from env) only when no admins exist.
   * Safe to call from process bootstrap.
   */
  async ensureSeed(): Promise<void> {
    const n = await this.count();
    if (n > 0) return;
    await this.create(env.ADMIN_INIT_USERNAME, env.ADMIN_INIT_PASSWORD);

    console.log(
      `[ucpb] Created initial admin "${env.ADMIN_INIT_USERNAME}" — please log in and change the password.`,
    );
  },
};
