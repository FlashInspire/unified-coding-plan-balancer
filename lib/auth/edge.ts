/**
 * Edge-runtime NextAuth instance for use in middleware.ts only.
 * Contains no Credentials provider and no Prisma/bcrypt imports.
 */
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/auth.config";

export const { auth } = NextAuth(authConfig);
