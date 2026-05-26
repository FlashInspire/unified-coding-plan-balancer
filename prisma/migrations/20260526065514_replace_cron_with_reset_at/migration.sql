/*
  Warnings:

  - You are about to drop the column `monthQuotaCron` on the `Provider` table. All the data in the column will be lost.
  - You are about to drop the column `rollingQuotaCron` on the `Provider` table. All the data in the column will be lost.
  - You are about to drop the column `weekQuotaCron` on the `Provider` table. All the data in the column will be lost.

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
    "rollingHourOffset" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Provider" ("apiKeyAnthropic", "apiKeyOpenai", "baseUrlAnthropic", "baseUrlOpenai", "createdAt", "enabled", "headersTemplate", "id", "monthQuota", "monthQuotaResetAt", "monthQuotaUsed", "name", "rollingQuota", "rollingQuotaResetAt", "rollingQuotaUsed", "updatedAt", "weekQuota", "weekQuotaResetAt", "weekQuotaUsed") SELECT "apiKeyAnthropic", "apiKeyOpenai", "baseUrlAnthropic", "baseUrlOpenai", "createdAt", "enabled", "headersTemplate", "id", "monthQuota", "monthQuotaResetAt", "monthQuotaUsed", "name", "rollingQuota", "rollingQuotaResetAt", "rollingQuotaUsed", "updatedAt", "weekQuota", "weekQuotaResetAt", "weekQuotaUsed" FROM "Provider";
DROP TABLE "Provider";
ALTER TABLE "new_Provider" RENAME TO "Provider";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
