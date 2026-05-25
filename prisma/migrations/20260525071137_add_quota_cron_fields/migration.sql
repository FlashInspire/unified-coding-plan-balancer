-- AlterTable
ALTER TABLE "Provider" ADD COLUMN "monthQuotaCron" TEXT DEFAULT '0 0 1 * *';
ALTER TABLE "Provider" ADD COLUMN "rollingQuotaCron" TEXT DEFAULT '0 */5 * * *';
ALTER TABLE "Provider" ADD COLUMN "weekQuotaCron" TEXT DEFAULT '0 0 * * 1';

-- DataMigration: backfill cron defaults for existing providers with non-null quotas
UPDATE "Provider" SET "rollingQuotaCron" = '0 */5 * * *' WHERE "rollingQuota" IS NOT NULL;
UPDATE "Provider" SET "weekQuotaCron"    = '0 0 * * 1'   WHERE "weekQuota"    IS NOT NULL;
UPDATE "Provider" SET "monthQuotaCron"   = '0 0 1 * *'   WHERE "monthQuota"   IS NOT NULL;
