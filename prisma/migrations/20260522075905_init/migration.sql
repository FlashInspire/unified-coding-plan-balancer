-- CreateTable
CREATE TABLE "Model" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "contextLength" INTEGER NOT NULL,
    "maxTokens" INTEGER NOT NULL,
    "apiMode" TEXT NOT NULL,
    "temperature" REAL,
    "topP" REAL,
    "topK" INTEGER,
    "reasoningEffort" TEXT,
    "includeReasoningInRequest" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "headersTemplate" TEXT NOT NULL,
    "encryptedApiKey" BLOB NOT NULL,
    "quotaHandlerClassName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProviderModel" (
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
    "inputPricePerMTok" REAL,
    "cachedInputPricePerMTok" REAL,
    "outputPricePerMTok" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProviderModel_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProviderModel_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopes" TEXT,
    "rateLimitRpm" INTEGER,
    "monthlyBudgetUsd" REAL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProviderQuotaSnapshot" (
    "providerId" TEXT NOT NULL PRIMARY KEY,
    "remainingCredits" REAL,
    "remainingRequests" INTEGER,
    "resetAt" DATETIME,
    "fetchedAt" DATETIME NOT NULL,
    "healthy" BOOLEAN NOT NULL DEFAULT true,
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
    "raw" TEXT,
    CONSTRAINT "ProviderQuotaSnapshot_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProviderModel_modelId_idx" ON "ProviderModel"("modelId");

-- CreateIndex
CREATE INDEX "ProviderModel_providerId_idx" ON "ProviderModel"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderModel_modelId_providerId_key" ON "ProviderModel"("modelId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");
