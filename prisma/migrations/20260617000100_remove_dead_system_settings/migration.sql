-- Remove SystemSetting overrides for keys that no longer have any consumer.
-- These periodic-tuning knobs were superseded by the external /api/cron
-- scheduler (every 60s) and are no longer read anywhere in code.

DELETE FROM "SystemSetting" WHERE "key" IN (
  'QUOTA_REFRESH_INTERVAL_MS',
  'QUOTA_REFRESH_CONCURRENCY',
  'METRICS_FLUSH_INTERVAL_MS'
);
