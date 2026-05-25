/**
 * Edge-runtime-safe NextAuth config.
 *
 * Middleware runs in the Edge runtime, which forbids Node.js modules (`fs`,
 * `crypto`, `bcryptjs`, Prisma, etc.). We therefore keep the *base* config —
 * just session strategy, pages, and the `authorized` callback — in this file,
 * and add the Credentials provider (which needs bcrypt + Prisma) only in
 * `lib/auth/nextauth.ts`, used by API routes and Server Components.
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  trustHost: true, // trust X-Forwarded-* behind nginx
  basePath: "/api/auth",
  cookies: {
    sessionToken: {
      name: "__Secure-next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
      },
    },
  },
  providers: [], // populated in lib/auth/nextauth.ts
  callbacks: {
    authorized: ({ auth, request }) => {
      const path = request.nextUrl.pathname;
      // Public paths
      if (
        path === "/login" ||
        path.startsWith("/api/auth") ||
        path.startsWith("/api/v1/") ||
        path.startsWith("/api/health") ||
        path.startsWith("/_next") ||
        path === "/favicon.ico"
      ) {
        return true;
      }
      return !!auth?.user;
    },
  },
};
