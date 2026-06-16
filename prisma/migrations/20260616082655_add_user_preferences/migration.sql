-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN     "dateTimeFormat" TEXT NOT NULL DEFAULT 'YYYY-MM-DD HH:mm:ss',
ADD COLUMN     "use24Hour" BOOLEAN NOT NULL DEFAULT true;
