/**
 * NextAuth (v5) configuration: Credentials provider for admin login.
 * NODE-ONLY — imports Prisma + bcryptjs. Do NOT import from middleware.
 * The middleware uses lib/auth/edge.ts instead.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { adminUserRepo } from "@/lib/repositories/adminUserRepo";
import { userPreferenceRepo } from "@/lib/repositories/userPreferenceRepo";
import { authConfig } from "@/lib/auth/auth.config";

const credsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { username, password } = parsed.data;
        const user = await prisma.adminUser.findUnique({ where: { username } });
        if (!user) return null;
        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;
        // Update last sign-in timestamp
        await adminUserRepo.updateLastSignIn(user.id);
        // Load user preferences for the JWT.
        const prefs = await userPreferenceRepo.get(user.id);
        return {
          id: user.id,
          name: user.username,
          role: user.role,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          mustChangePassword: user.mustChangePassword,
          language: prefs.language,
          theme: prefs.theme,
          dateTimeFormat: prefs.dateTimeFormat,
          use24Hour: prefs.use24Hour,
        };
      },
    }),
  ],
});
