/*
  Warnings:

  - You are about to drop the column `apiMode` on the `Model` table. All the data in the column will be lost.
  - You are about to drop the column `apiModeOverride` on the `ProviderModel` table. All the data in the column will be lost.
  - Added the required column `apiMode` to the `Provider` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Model" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "contextLength" INTEGER NOT NULL,
    "maxTokens" INTEGER NOT NULL,
    "temperature" REAL,
    "topP" REAL,
    "topK" INTEGER,
    "reasoningEffort" TEXT,
    "includeReasoningInRequest" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Model" ("contextLength", "createdAt", "displayName", "enabled", "id", "includeReasoningInRequest", "maxTokens", "reasoningEffort", "temperature", "topK", "topP", "updatedAt") SELECT "contextLength", "createdAt", "displayName", "enabled", "id", "includeReasoningInRequest", "maxTokens", "reasoningEffort", "temperature", "topK", "topP", "updatedAt" FROM "Model";
DROP TABLE "Model";
ALTER TABLE "new_Model" RENAME TO "Model";
CREATE TABLE "new_Provider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiMode" TEXT NOT NULL,
    "headersTemplate" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "quotaHandlerClassName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Provider" ("apiKey", "baseUrl", "createdAt", "enabled", "headersTemplate", "id", "name", "quotaHandlerClassName", "updatedAt") SELECT "apiKey", "baseUrl", "createdAt", "enabled", "headersTemplate", "id", "name", "quotaHandlerClassName", "updatedAt" FROM "Provider";
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
