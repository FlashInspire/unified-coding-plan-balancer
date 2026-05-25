/*
  Warnings:

  - You are about to drop the column `consecutiveErrors` on the `ProviderQuotaSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `raw` on the `ProviderQuotaSnapshot` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProviderQuotaSnapshot" (
    "providerId" TEXT NOT NULL PRIMARY KEY,
    "usagePercent" REAL,
    "fetchedAt" DATETIME NOT NULL,
    "healthy" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ProviderQuotaSnapshot_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProviderQuotaSnapshot" ("fetchedAt", "healthy", "providerId", "usagePercent") SELECT "fetchedAt", "healthy", "providerId", "usagePercent" FROM "ProviderQuotaSnapshot";
DROP TABLE "ProviderQuotaSnapshot";
ALTER TABLE "new_ProviderQuotaSnapshot" RENAME TO "ProviderQuotaSnapshot";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
