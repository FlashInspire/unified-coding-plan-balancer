/*
  Warnings:

  - You are about to drop the column `quotaHandlerClassName` on the `Provider` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Provider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiMode" TEXT NOT NULL,
    "headersTemplate" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "rollingQuota" INTEGER,
    "weekQuota" INTEGER,
    "monthQuota" INTEGER,
    "rollingQuotaUsed" INTEGER NOT NULL DEFAULT 0,
    "weekQuotaUsed" INTEGER NOT NULL DEFAULT 0,
    "monthQuotaUsed" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Provider" ("apiKey", "apiMode", "baseUrl", "createdAt", "enabled", "headersTemplate", "id", "name", "updatedAt") SELECT "apiKey", "apiMode", "baseUrl", "createdAt", "enabled", "headersTemplate", "id", "name", "updatedAt" FROM "Provider";
DROP TABLE "Provider";
ALTER TABLE "new_Provider" RENAME TO "Provider";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
