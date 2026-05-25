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
        return { id: user.id, name: user.username };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt: ({ token, user }) => {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
