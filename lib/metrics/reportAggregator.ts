/**
 * Period-boundary helpers used by the live report updater
 * (`lib/metrics/liveReportUpdater.ts`) and the
 * `ensureLatestReports` cron task.
 *
 * AggregateReport rows are produced incrementally — the live updater
 * upserts the `latest=true` row for each (granularity, providerId,
 * modelId, apiKeyId) tuple on every API call. There is no longer a
 * post-hoc aggregator that scans `request_log`.
 */

export type Granularity = "hour" | "day" | "week" | "month";

/** Truncate an epoch-ms timestamp to the start of the given granularity. */
export function truncateToGranularity(ts: number, g: Granularity): number {
  const d = new Date(ts);
  switch (g) {
    case "hour":
      d.setUTCMinutes(0, 0, 0);
      return d.getTime();
    case "day":
      d.setUTCHours(0, 0, 0, 0);
      return d.getTime();
    case "week": {
      // Monday 00:00 UTC
      d.setUTCHours(0, 0, 0, 0);
      const dow = d.getUTCDay(); // 0=Sun, 1=Mon, …
      const diff = (dow + 6) % 7; // days since last Monday
      d.setUTCDate(d.getUTCDate() - diff);
      return d.getTime();
    }
    case "month":
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      return d.getTime();
  }
}
