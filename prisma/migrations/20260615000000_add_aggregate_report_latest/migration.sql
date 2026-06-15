-- AddColumn: latest flag on aggregate_report
-- When true, marks the single active (current-period) row per
-- (granularity, provider_id, model_id, api_key_id).
-- The application ensures only one latest=true row exists per dimension group.

ALTER TABLE "aggregate_report" ADD COLUMN "latest" BOOLEAN NOT NULL DEFAULT false;

-- Index for fast "latest=true" lookups used by liveReportUpdater
CREATE INDEX "aggregate_report_granularity_provider_model_key_latest_idx"
  ON "aggregate_report"("granularity", "provider_id", "model_id", "api_key_id", "latest");
