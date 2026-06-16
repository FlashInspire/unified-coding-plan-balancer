-- AlterTable: add model_name denormalized column to request_log
ALTER TABLE "request_log" ADD COLUMN "model_name" TEXT;
