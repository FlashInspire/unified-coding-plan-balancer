-- Drop UsageMinute table — per-minute aggregate is no longer maintained.
-- AggregateReport (hour/day/week/month) is updated incrementally by the
-- live report updater (lib/metrics/liveReportUpdater.ts).

DROP TABLE IF EXISTS "usage_minute";
