/*
  Warnings:

  - You are about to drop the column `monthlyBudgetUsd` on the `ApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `prefix` on the `ApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `rateLimitRpm` on the `ApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `scopes` on the `ApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `encryptedApiKey` on the `Provider` table. All the data in the column will be lost.
  - You are about to drop the column `cachedInputPricePerMTok` on the `ProviderModel` table. All the data in the column will be lost.
  - You are about to drop the column `inputPricePerMTok` on the `ProviderModel` table. All the data in the column will be lost.
  - You are about to drop the column `outputPricePerMTok` on the `ProviderModel` table. All the data in the column will be lost.
  - You are about to drop the column `remainingCredits` on the `ProviderQuotaSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `remainingRequests` on the `ProviderQuotaSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `resetAt` on the `ProviderQuotaSnapshot` table. All the data in the column will be lost.
  - Added the required column `apiKey` to the `Provider` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME
);
INSERT INTO "new_ApiKey" ("createdAt", "enabled", "id", "keyHash", "lastUsedAt", "name") SELECT "createdAt", "enabled", "id", "keyHash", "lastUsedAt", "name" FROM "ApiKey";
DROP TABLE "ApiKey";
ALTER TABLE "new_ApiKey" RENAME TO "ApiKey";
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE TABLE "new_Provider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "headersTemplate" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "quotaHandlerClassName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Provider" ("baseUrl", "createdAt", "enabled", "headersTemplate", "id", "name", "quotaHandlerClassName", "updatedAt") SELECT "baseUrl", "createdAt", "enabled", "headersTemplate", "id", "name", "quotaHandlerClassName", "updatedAt" FROM "Provider";
DROP TABLE "Provider";
ALTER TABLE "new_Provider" RENAME TO "Provider";
CREATE TABLE "new_ProviderModel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "realModelId" TEXT NOT NULL,
    "contextLengthOverride" INTEGER,
    "maxTokensOverride" INTEGER,
    "apiModeOverride" TEXT,
    "temperatureOverride" REAL,
    "topPOverride" REAL,
    "topKOverride" INTEGER,
    "reasoningEffortOverride" TEXT,
    "includeReasoningInRequestOverride" BOOLEAN,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProviderModel_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProviderModel_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProviderModel" ("apiModeOverride", "contextLengthOverride", "createdAt", "enabled", "id", "includeReasoningInRequestOverride", "maxTokensOverride", "modelId", "providerId", "realModelId", "reasoningEffortOverride", "temperatureOverride", "topKOverride", "topPOverride", "updatedAt", "weight") SELECT "apiModeOverride", "contextLengthOverride", "createdAt", "enabled", "id", "includeReasoningInRequestOverride", "maxTokensOverride", "modelId", "providerId", "realModelId", "reasoningEffortOverride", "temperatureOverride", "topKOverride", "topPOverride", "updatedAt", "weight" FROM "ProviderModel";
DROP TABLE "ProviderModel";
ALTER TABLE "new_ProviderModel" RENAME TO "ProviderModel";
CREATE INDEX "ProviderModel_modelId_idx" ON "ProviderModel"("modelId");
CREATE INDEX "ProviderModel_providerId_idx" ON "ProviderModel"("providerId");
CREATE UNIQUE INDEX "ProviderModel_modelId_providerId_key" ON "ProviderModel"("modelId", "providerId");
CREATE TABLE "new_ProviderQuotaSnapshot" (
    "providerId" TEXT NOT NULL PRIMARY KEY,
    "usagePercent" REAL,
    "fetchedAt" DATETIME NOT NULL,
    "healthy" BOOLEAN NOT NULL DEFAULT true,
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
    "raw" TEXT,
    CONSTRAINT "ProviderQuotaSnapshot_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProviderQuotaSnapshot" ("consecutiveErrors", "fetchedAt", "healthy", "providerId", "raw") SELECT "consecutiveErrors", "fetchedAt", "healthy", "providerId", "raw" FROM "ProviderQuotaSnapshot";
DROP TABLE "ProviderQuotaSnapshot";
ALTER TABLE "new_ProviderQuotaSnapshot" RENAME TO "ProviderQuotaSnapshot";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
