-- Remove dailyQuota and dailyQuotaResetAt from AdminUser.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

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
    "rollingInputTokensUsed", "rollingCachedReadTokensUsed", "rollingOutputTokensUsed",
    "weekInputTokensUsed", "weekCachedReadTokensUsed", "weekOutputTokensUsed",
    "monthInputTokensUsed", "monthCachedReadTokensUsed", "monthOutputTokensUsed",
    "rollingQuotaResetAt", "weekQuotaResetAt", "monthQuotaResetAt",
    "quotaMultiplierInput", "quotaMultiplierCachedRead", "quotaMultiplierOutput"
)
SELECT
    "id", "username", "passwordHash", "role", "email", "displayName", "avatarUrl",
    "mustChangePassword", "lastSignInAt", "createdAt",
    "rollingQuota", "weekQuota", "monthQuota",
    "rollingInputTokensUsed", "rollingCachedReadTokensUsed", "rollingOutputTokensUsed",
    "weekInputTokensUsed", "weekCachedReadTokensUsed", "weekOutputTokensUsed",
    "monthInputTokensUsed", "monthCachedReadTokensUsed", "monthOutputTokensUsed",
    "rollingQuotaResetAt", "weekQuotaResetAt", "monthQuotaResetAt",
    "quotaMultiplierInput", "quotaMultiplierCachedRead", "quotaMultiplierOutput"
FROM "AdminUser";

DROP TABLE "AdminUser";
ALTER TABLE "new_AdminUser" RENAME TO "AdminUser";
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
