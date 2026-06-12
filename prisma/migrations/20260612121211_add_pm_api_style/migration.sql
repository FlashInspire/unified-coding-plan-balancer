-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProviderModel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "realModelId" TEXT,
    "contextLengthOverride" INTEGER,
    "maxTokensOverride" INTEGER,
    "temperatureOverride" REAL,
    "topPOverride" REAL,
    "topKOverride" INTEGER,
    "reasoningEffortOverride" TEXT,
    "includeReasoningInRequestOverride" BOOLEAN,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "apiStyle" TEXT NOT NULL DEFAULT 'auto',
    "feeRateInput" REAL NOT NULL DEFAULT 1.0,
    "feeRateCachedInput" REAL NOT NULL DEFAULT 0.1,
    "feeRateOutput" REAL NOT NULL DEFAULT 4.0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProviderModel_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProviderModel_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProviderModel" ("contextLengthOverride", "createdAt", "enabled", "feeRateCachedInput", "feeRateInput", "feeRateOutput", "id", "includeReasoningInRequestOverride", "maxTokensOverride", "modelId", "providerId", "realModelId", "reasoningEffortOverride", "temperatureOverride", "topKOverride", "topPOverride", "updatedAt", "weight") SELECT "contextLengthOverride", "createdAt", "enabled", "feeRateCachedInput", "feeRateInput", "feeRateOutput", "id", "includeReasoningInRequestOverride", "maxTokensOverride", "modelId", "providerId", "realModelId", "reasoningEffortOverride", "temperatureOverride", "topKOverride", "topPOverride", "updatedAt", "weight" FROM "ProviderModel";
DROP TABLE "ProviderModel";
ALTER TABLE "new_ProviderModel" RENAME TO "ProviderModel";
CREATE INDEX "ProviderModel_modelId_idx" ON "ProviderModel"("modelId");
CREATE INDEX "ProviderModel_providerId_idx" ON "ProviderModel"("providerId");
CREATE UNIQUE INDEX "ProviderModel_modelId_providerId_key" ON "ProviderModel"("modelId", "providerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
