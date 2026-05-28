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
    "quotaRunningOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Provider" ("apiKeyAnthropic", "apiKeyOpenai", "baseUrlAnthropic", "baseUrlOpenai", "createdAt", "enabled", "headersTemplate", "id", "monthCacheInputTokensUsed", "monthOutputTokensUsed", "monthQuota", "monthQuotaResetAt", "monthQuotaUsed", "name", "rollingCacheInputTokensUsed", "rollingHourOffset", "rollingOutputTokensUsed", "rollingQuota", "rollingQuotaResetAt", "rollingQuotaUsed", "updatedAt", "usageMode", "weekCacheInputTokensUsed", "weekOutputTokensUsed", "weekQuota", "weekQuotaResetAt", "weekQuotaUsed") SELECT "apiKeyAnthropic", "apiKeyOpenai", "baseUrlAnthropic", "baseUrlOpenai", "createdAt", "enabled", "headersTemplate", "id", "monthCacheInputTokensUsed", "monthOutputTokensUsed", "monthQuota", "monthQuotaResetAt", "monthQuotaUsed", "name", "rollingCacheInputTokensUsed", "rollingHourOffset", "rollingOutputTokensUsed", "rollingQuota", "rollingQuotaResetAt", "rollingQuotaUsed", "updatedAt", "usageMode", "weekCacheInputTokensUsed", "weekOutputTokensUsed", "weekQuota", "weekQuotaResetAt", "weekQuotaUsed" FROM "Provider";
DROP TABLE "Provider";
ALTER TABLE "new_Provider" RENAME TO "Provider";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
