/**
 * Live report updater — increments the four `latest=true` AggregateReport rows
 * (HOUR, DAY, WEEK, MONTH) immediately after each API call completes.
 *
 * Each call finds or creates the current-period row for the matching dimension
 * tuple (granularity, providerId, modelId, apiKeyId) and atomically increments
 * its counters.  If the stored row belongs to a past period (i.e. the clock has
 * crossed a boundary), it is retired (latest=false) and a fresh row is created.
 *
 * This function is called from dispatch.ts at every `recordUsage()` site and
 * is fire-and-forget (errors are swallowed so they never block responses).
 */

import { prisma } from "@/lib/prisma";
import { truncateToGranularity } from "@/lib/metrics/reportAggregator";

type Granularity = "hour" | "day" | "week" | "month";

const GRANULARITIES: Granularity[] = ["hour", "day", "week", "month"];

export interface LiveReportParams {
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  apiKeyId: string;
  apiKeyName: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  ttftMs: number | null;
  tpsOut: number | null;
  status: number;
  ts: number; // epoch ms of the request
}

/**
 * Update the four latest AggregateReport rows (one per granularity) for the
 * given dimension tuple.  Must be called after each successful or failed
 * (completed) API call.
 *
 * Never throws — all errors are silently swallowed to protect the response path.
 */
export async function updateLatestReports(
  params: LiveReportParams,
): Promise<void> {
  const {
    providerId,
    providerName,
    modelId,
    modelName,
    apiKeyId,
    apiKeyName,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    ttftMs,
    tpsOut,
    status,
    ts,
  } = params;

  const isOk = status >= 200 && status < 300;
  const requestsOkInc = isOk ? 1 : 0;
  const requestsErrInc = isOk ? 0 : 1;
  const ttftMsSumInc = ttftMs != null ? Math.round(ttftMs) : 0;
  const ttftMsCountInc = ttftMs != null ? 1 : 0;
  const tpsOutSumInc = tpsOut != null ? tpsOut : 0;
  const tpsOutCountInc = tpsOut != null ? 1 : 0;

  // Treat empty / whitespace-only names as missing so the display layer can
  // fall back to the underlying id.
  const normName = (s: string): string | null => {
    const t = s?.trim();
    return t ? t : null;
  };
  const providerNameVal = normName(providerName);
  const modelNameVal = normName(modelName);
  const apiKeyNameVal = normName(apiKeyName);

  for (const granularity of GRANULARITIES) {
    try {
      const periodStartMs = truncateToGranularity(ts, granularity);
      const periodStartBig = BigInt(periodStartMs);

      await prisma.$transaction(async (tx) => {
        const existing = await tx.aggregateReport.findFirst({
          where: { granularity, providerId, modelId, apiKeyId, latest: true },
          select: { id: true, periodStart: true },
        });

        if (existing) {
          if (existing.periodStart === periodStartBig) {
            // Same period — increment in place and refresh names so renames
            // propagate to the latest-period row.
            await tx.aggregateReport.update({
              where: { id: existing.id },
              data: {
                providerName: providerNameVal,
                modelName: modelNameVal,
                apiKeyName: apiKeyNameVal,
                requests: { increment: 1 },
                requestsOk: { increment: requestsOkInc },
                requestsErr: { increment: requestsErrInc },
                inputTokens: { increment: inputTokens },
                cachedInputTokens: { increment: cachedInputTokens },
                outputTokens: { increment: outputTokens },
                ttftMsSum: { increment: ttftMsSumInc },
                ttftMsCount: { increment: ttftMsCountInc },
                tpsOutSum: { increment: tpsOutSumInc },
                tpsOutCount: { increment: tpsOutCountInc },
              },
            });
            return;
          }
          // Period rolled over — retire the old row
          await tx.aggregateReport.update({
            where: { id: existing.id },
            data: { latest: false },
          });
        }

        // Create new latest row for the current period.
        // Use upsert to handle the rare race where two concurrent requests both
        // hit the "not found" branch for the same period.
        await tx.aggregateReport.upsert({
          where: {
            granularity_periodStart_providerId_modelId_apiKeyId: {
              granularity,
              periodStart: periodStartBig,
              providerId,
              modelId,
              apiKeyId,
            },
          },
          create: {
            granularity,
            periodStart: periodStartBig,
            providerId,
            providerName: providerNameVal,
            modelId,
            modelName: modelNameVal,
            apiKeyId,
            apiKeyName: apiKeyNameVal,
            latest: true,
            requests: 1,
            requestsOk: requestsOkInc,
            requestsErr: requestsErrInc,
            inputTokens,
            cachedInputTokens,
            outputTokens,
            ttftMsSum: ttftMsSumInc,
            ttftMsCount: ttftMsCountInc,
            tpsOutSum: tpsOutSumInc,
            tpsOutCount: tpsOutCountInc,
          },
          update: {
            latest: true,
            providerName: providerNameVal,
            modelName: modelNameVal,
            apiKeyName: apiKeyNameVal,
            requests: { increment: 1 },
            requestsOk: { increment: requestsOkInc },
            requestsErr: { increment: requestsErrInc },
            inputTokens: { increment: inputTokens },
            cachedInputTokens: { increment: cachedInputTokens },
            outputTokens: { increment: outputTokens },
            ttftMsSum: { increment: ttftMsSumInc },
            ttftMsCount: { increment: ttftMsCountInc },
            tpsOutSum: { increment: tpsOutSumInc },
            tpsOutCount: { increment: tpsOutCountInc },
          },
        });
      });
    } catch {
      // Best-effort — never block or fail the caller
    }
  }
}
