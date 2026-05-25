/**
 * NextAuth route handler — required by next-auth v5.
 */
import { handlers } from "@/lib/auth/nextauth";
export const { GET, POST } = handlers;
