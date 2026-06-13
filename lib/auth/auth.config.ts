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
      }
      if (trigger === "update" && session) {
        const s = session as {
          mustChangePassword?: boolean;
          language?: string;
          theme?: string;
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
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.mustChangePassword = token.mustChangePassword as boolean;
        session.user.language = (token.language as string) ?? "en";
        session.user.theme = (token.theme as string) ?? "system";
      }
      return session;
    },
  },
};
