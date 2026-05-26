/*
  Warnings:

  - You are about to drop the column `feeRate` on the `ProviderModel` table. All the data in the column will be lost.

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
    "usageMode" TEXT NOT NULL DEFAULT 'request',
    "rollingCacheInputTokensUsed" REAL NOT NULL DEFAULT 0.0,
    "rollingOutputTokensUsed" REAL NOT NULL DEFAULT 0.0,
    "weekCacheInputTokensUsed" REAL NOT NULL DEFAULT 0.0,
    "weekOutputTokensUsed" REAL NOT NULL DEFAULT 0.0,
    "monthCacheInputTokensUsed" REAL NOT NULL DEFAULT 0.0,
    "monthOutputTokensUsed" REAL NOT NULL DEFAULT 0.0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Provider" ("apiKeyAnthropic", "apiKeyOpenai", "baseUrlAnthropic", "baseUrlOpenai", "createdAt", "enabled", "headersTemplate", "id", "monthQuota", "monthQuotaResetAt", "monthQuotaUsed", "name", "rollingHourOffset", "rollingQuota", "rollingQuotaResetAt", "rollingQuotaUsed", "updatedAt", "weekQuota", "weekQuotaResetAt", "weekQuotaUsed") SELECT "apiKeyAnthropic", "apiKeyOpenai", "baseUrlAnthropic", "baseUrlOpenai", "createdAt", "enabled", "headersTemplate", "id", "monthQuota", "monthQuotaResetAt", "monthQuotaUsed", "name", "rollingHourOffset", "rollingQuota", "rollingQuotaResetAt", "rollingQuotaUsed", "updatedAt", "weekQuota", "weekQuotaResetAt", "weekQuotaUsed" FROM "Provider";
DROP TABLE "Provider";
ALTER TABLE "new_Provider" RENAME TO "Provider";
CREATE TABLE "new_ProviderModel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "realModelId" TEXT NOT NULL,
    "contextLengthOverride" INTEGER,
    "maxTokensOverride" INTEGER,
    "temperatureOverride" REAL,
    "topPOverride" REAL,
    "topKOverride" INTEGER,
    "reasoningEffortOverride" TEXT,
    "includeReasoningInRequestOverride" BOOLEAN,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "feeRateInput" REAL NOT NULL DEFAULT 1.0,
    "feeRateCachedInput" REAL NOT NULL DEFAULT 0.1,
    "feeRateOutput" REAL NOT NULL DEFAULT 4.0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProviderModel_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProviderModel_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProviderModel" ("contextLengthOverride", "createdAt", "enabled", "id", "includeReasoningInRequestOverride", "maxTokensOverride", "modelId", "providerId", "realModelId", "reasoningEffortOverride", "temperatureOverride", "topKOverride", "topPOverride", "updatedAt", "weight") SELECT "contextLengthOverride", "createdAt", "enabled", "id", "includeReasoningInRequestOverride", "maxTokensOverride", "modelId", "providerId", "realModelId", "reasoningEffortOverride", "temperatureOverride", "topKOverride", "topPOverride", "updatedAt", "weight" FROM "ProviderModel";
DROP TABLE "ProviderModel";
ALTER TABLE "new_ProviderModel" RENAME TO "ProviderModel";
CREATE INDEX "ProviderModel_modelId_idx" ON "ProviderModel"("modelId");
CREATE INDEX "ProviderModel_providerId_idx" ON "ProviderModel"("providerId");
CREATE UNIQUE INDEX "ProviderModel_modelId_providerId_key" ON "ProviderModel"("modelId", "providerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
