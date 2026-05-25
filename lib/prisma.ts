/**
 * PrismaClient singleton. Avoids creating multiple instances under Next.js
 * hot reload in development.
 *
 * Prisma v7 requires a driver adapter; we use better-sqlite3 against the
 * SQLite file configured by DATABASE_URL.
 */
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  __ucpb_prisma?: PrismaClient;
};

/** Translate a Prisma SQLite connection string to a better-sqlite3 path. */
function urlToSqlitePath(url: string): string {
  // file:./data/config.sqlite  OR  file:../data/config.sqlite
  if (url.startsWith("file:")) return url.slice("file:".length);
  return url;
}

function makeClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({
    url: urlToSqlitePath(
      process.env.DATABASE_URL ?? "file:./data/config.sqlite",
    ),
  });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient =
  globalForPrisma.__ucpb_prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__ucpb_prisma = prisma;
}
