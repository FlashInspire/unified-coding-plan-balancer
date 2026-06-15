/**
 * PrismaClient singleton. Avoids creating multiple instances under Next.js
 * hot reload in development.
 *
 * Prisma natively supports PostgreSQL via DATABASE_URL — no adapter needed.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  __ucpb_prisma?: PrismaClient;
};

function makeClient(): PrismaClient {
  return new PrismaClient();
}

export const prisma: PrismaClient =
  globalForPrisma.__ucpb_prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__ucpb_prisma = prisma;
}
