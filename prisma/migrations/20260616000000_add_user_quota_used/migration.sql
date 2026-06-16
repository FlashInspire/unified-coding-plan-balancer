-- AlterTable: Add single total quotaUsed fields to AdminUser
ALTER TABLE "AdminUser" ADD COLUMN "rollingQuotaUsed" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "AdminUser" ADD COLUMN "weekQuotaUsed" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "AdminUser" ADD COLUMN "monthQuotaUsed" DOUBLE PRECISION NOT NULL DEFAULT 0;
