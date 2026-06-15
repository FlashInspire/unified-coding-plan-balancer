/**
 * PrismaClient singleton. Avoids creating multiple instances under Next.js
 * hot reload in development.
 *
 * Prisma v7 requires a driver adapter — DATABASE_URL is passed via PrismaPg.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  __ucpb_prisma?: PrismaClient;
};

function makeClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient =
  globalForPrisma.__ucpb_prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__ucpb_prisma = prisma;
}
