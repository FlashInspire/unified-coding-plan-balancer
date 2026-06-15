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
      // Must-change-password: only allow the change-password page
      if (auth?.user?.mustChangePassword) {
        if (path === "/change-password") return true;
        const url = request.nextUrl.clone();
        url.pathname = "/change-password";
        url.searchParams.set("callbackUrl", path);
        return Response.redirect(url);
      }
      return !!auth?.user;
    },
    jwt: ({ token, user, trigger, session }) => {
      if (user) {
        token.id = user.id;
        token.mustChangePassword =
          (user as { mustChangePassword?: boolean }).mustChangePassword ??
          false;
        // Carry preferences from the user object (set by Credentials provider).
        token.language = (user as { language?: string }).language ?? "en";
        token.theme = (user as { theme?: string }).theme ?? "system";
        // Profile fields.
        token.role = (user as { role?: string }).role ?? "user";
        token.email = (user as { email?: string | null }).email ?? null;
        token.displayName =
          (user as { displayName?: string | null }).displayName ?? null;
        token.avatarUrl =
          (user as { avatarUrl?: string | null }).avatarUrl ?? null;
      }
      if (trigger === "update" && session) {
        const s = session as {
          mustChangePassword?: boolean;
          language?: string;
          theme?: string;
          email?: string | null;
          displayName?: string | null;
          avatarUrl?: string | null;
        };
        if (typeof s.mustChangePassword === "boolean") {
          token.mustChangePassword = s.mustChangePassword;
        }
        if (typeof s.language === "string") {
          token.language = s.language;
        }
        if (typeof s.theme === "string") {
          token.theme = s.theme;
        }
        if (s.email !== undefined) token.email = s.email;
        if (s.displayName !== undefined) token.displayName = s.displayName;
        if (s.avatarUrl !== undefined) token.avatarUrl = s.avatarUrl;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user && token.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const u = session.user as any;
        u.id = token.id as string;
        u.mustChangePassword = token.mustChangePassword as boolean;
        u.language = (token.language as string) ?? "en";
        u.theme = (token.theme as string) ?? "system";
        u.role = (token.role as string) ?? "user";
        u.email = (token.email as string | null) ?? null;
        u.displayName = (token.displayName as string | null) ?? null;
        u.avatarUrl = (token.avatarUrl as string | null) ?? null;
      }
      return session;
    },
  },
};
