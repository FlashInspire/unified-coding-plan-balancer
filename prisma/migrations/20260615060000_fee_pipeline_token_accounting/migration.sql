-- Fee pipeline token accounting migration.
-- Replaces AdminUser.tokensUsed (single counter) with per-dimension counters.
-- Adds dailyQuota, quotaMultiplier* to AdminUser.
-- Adds per-dimension token counters + reset timestamps to ApiKey.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- ── AdminUser: rebuild to remove tokensUsed, add dimension counters ──────────

CREATE TABLE "new_AdminUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "email" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastSignInAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rollingQuota" INTEGER,
    "weekQuota" INTEGER,
    "monthQuota" INTEGER,
    "dailyQuota" INTEGER,
    "dailyQuotaResetAt" DATETIME,
    "rollingInputTokensUsed" REAL NOT NULL DEFAULT 0,
    "rollingCachedReadTokensUsed" REAL NOT NULL DEFAULT 0,
    "rollingOutputTokensUsed" REAL NOT NULL DEFAULT 0,
    "weekInputTokensUsed" REAL NOT NULL DEFAULT 0,
    "weekCachedReadTokensUsed" REAL NOT NULL DEFAULT 0,
    "weekOutputTokensUsed" REAL NOT NULL DEFAULT 0,
    "monthInputTokensUsed" REAL NOT NULL DEFAULT 0,
    "monthCachedReadTokensUsed" REAL NOT NULL DEFAULT 0,
    "monthOutputTokensUsed" REAL NOT NULL DEFAULT 0,
    "rollingQuotaResetAt" DATETIME,
    "weekQuotaResetAt" DATETIME,
    "monthQuotaResetAt" DATETIME,
    "quotaMultiplierInput" REAL NOT NULL DEFAULT 1.0,
    "quotaMultiplierCachedRead" REAL NOT NULL DEFAULT 0.1,
    "quotaMultiplierOutput" REAL NOT NULL DEFAULT 4.0
);

INSERT INTO "new_AdminUser" (
    "id", "username", "passwordHash", "role", "email", "displayName", "avatarUrl",
    "mustChangePassword", "lastSignInAt", "createdAt",
    "rollingQuota", "weekQuota", "monthQuota",
    "rollingQuotaResetAt", "weekQuotaResetAt", "monthQuotaResetAt"
)
SELECT
    "id", "username", "passwordHash", "role", "email", "displayName", "avatarUrl",
    "mustChangePassword", "lastSignInAt", "createdAt",
    "rollingQuota", "weekQuota", "monthQuota",
    "rollingQuotaResetAt", "weekQuotaResetAt", "monthQuotaResetAt"
FROM "AdminUser";

DROP TABLE "AdminUser";
ALTER TABLE "new_AdminUser" RENAME TO "AdminUser";
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- ── ApiKey: rebuild to add per-dimension token counters ──────────────────────

CREATE TABLE "new_ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    "rollingInputTokensUsed" REAL NOT NULL DEFAULT 0,
    "rollingCachedReadTokensUsed" REAL NOT NULL DEFAULT 0,
    "rollingOutputTokensUsed" REAL NOT NULL DEFAULT 0,
    "weekInputTokensUsed" REAL NOT NULL DEFAULT 0,
    "weekCachedReadTokensUsed" REAL NOT NULL DEFAULT 0,
    "weekOutputTokensUsed" REAL NOT NULL DEFAULT 0,
    "monthInputTokensUsed" REAL NOT NULL DEFAULT 0,
    "monthCachedReadTokensUsed" REAL NOT NULL DEFAULT 0,
    "monthOutputTokensUsed" REAL NOT NULL DEFAULT 0,
    "rollingQuotaResetAt" DATETIME,
    "weekQuotaResetAt" DATETIME,
    "monthQuotaResetAt" DATETIME,
    CONSTRAINT "ApiKey_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_ApiKey" ("id", "keyHash", "name", "ownerId", "enabled", "createdAt", "lastUsedAt")
SELECT "id", "keyHash", "name", "ownerId", "enabled", "createdAt", "lastUsedAt"
FROM "ApiKey";

DROP TABLE "ApiKey";
ALTER TABLE "new_ApiKey" RENAME TO "ApiKey";
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX "ApiKey_ownerId_idx" ON "ApiKey"("ownerId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
