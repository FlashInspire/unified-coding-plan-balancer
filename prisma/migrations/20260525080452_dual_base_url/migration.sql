/*
  Warnings:

  - You are about to drop the column `apiKey` on the `Provider` table. All the data in the column will be lost.
  - You are about to drop the column `apiMode` on the `Provider` table. All the data in the column will be lost.
  - You are about to drop the column `baseUrl` on the `Provider` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Provider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "baseUrlOpenai" TEXT,
    "apiKeyOpenai" TEXT,
    "baseUrlAnthropic" TEXT,
    "apiKeyAnthropic" TEXT,
    "headersTemplate" TEXT NOT NULL,
    "rollingQuota" INTEGER,
    "weekQuota" INTEGER,
    "monthQuota" INTEGER,
    "rollingQuotaUsed" REAL NOT NULL DEFAULT 0.0,
    "weekQuotaUsed" REAL NOT NULL DEFAULT 0.0,
    "monthQuotaUsed" REAL NOT NULL DEFAULT 0.0,
    "rollingQuotaResetAt" DATETIME,
    "weekQuotaResetAt" DATETIME,
    "monthQuotaResetAt" DATETIME,
    "rollingQuotaCron" TEXT DEFAULT '0 */5 * * *',
    "weekQuotaCron" TEXT DEFAULT '0 0 * * 1',
    "monthQuotaCron" TEXT DEFAULT '0 0 1 * *',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Provider" ("createdAt", "enabled", "headersTemplate", "id", "monthQuota", "monthQuotaCron", "monthQuotaResetAt", "monthQuotaUsed", "name", "rollingQuota", "rollingQuotaCron", "rollingQuotaResetAt", "rollingQuotaUsed", "updatedAt", "weekQuota", "weekQuotaCron", "weekQuotaResetAt", "weekQuotaUsed", "baseUrlOpenai", "apiKeyOpenai") SELECT "createdAt", "enabled", "headersTemplate", "id", "monthQuota", "monthQuotaCron", "monthQuotaResetAt", "monthQuotaUsed", "name", "rollingQuota", "rollingQuotaCron", "rollingQuotaResetAt", "rollingQuotaUsed", "updatedAt", "weekQuota", "weekQuotaCron", "weekQuotaResetAt", "weekQuotaUsed", "baseUrl", "apiKey" FROM "Provider";
DROP TABLE "Provider";
ALTER TABLE "new_Provider" RENAME TO "Provider";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
