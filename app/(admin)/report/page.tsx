"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { apiFetch } from "../_components/api";
import {
  ReportFiltersBar,
  type ReportFilters,
  type Granularity,
} from "./_components/report-filters";
import type { AggregateReportRow } from "@/lib/metrics/queryRouter";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "../_components/i18n-provider";
import { useSession } from "next-auth/react";
import { useFormatDate } from "../_components/datetime-format-provider";
import { RankBarChart } from "../_components/rank-bar-chart";
import { displayName } from "@/lib/utils";
import {
  GroupedReportTable,
  type GroupByLevel,
} from "./_components/grouped-report-table";

type SessionUser = {
  role?: string;
};

function toEpochMs(dateStr: string, endOfDay = false): number | undefined {
  if (!dateStr) return undefined;
  const [y, m, day] = dateStr.split("-").map(Number);
  if (!y || !m || !day) return undefined;
  const d = new Date(Date.UTC(y, m - 1, day));
  if (isNaN(d.getTime())) return undefined;
  if (endOfDay) {
    d.setUTCHours(23, 59, 59, 999);
  }
  return d.getTime();
}

export default function ReportPage() {
  const t = useT();
  const formatDate = useFormatDate();
  const { data: session } = useSession();
  const isAdmin = (session?.user as SessionUser)?.role === "admin";

  const [rows, setRows] = useState<AggregateReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [chartRows, setChartRows] = useState<AggregateReportRow[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  const [filters, setFilters] = useState<ReportFilters>({
    granularity: "day" as Granularity,
    modelId: "",
    providerId: "",
    apiKeyId: "",
    from: "",
    to: "",
    groupBy: ["period", "model", "provider", "apiKey"],
  });

  // Options for filter dropdowns
  const [apiKeyOptions, setApiKeyOptions] = useState<
    { id: string; name: string }[]
  >([]);

  // Load API key options for admin users
  useEffect(() => {
    if (isAdmin) {
      void apiFetch<{ data: { id: string; name: string }[] }>(
        "/api/admin/api-keys?limit=200",
      )
        .then((r) =>
          setApiKeyOptions(r.data.map((k) => ({ id: k.id, name: k.name }))),
        )
        .catch(() => {});
    }
  }, [isAdmin]);

  // Derive model/provider options from loaded rows.
  // Each option carries the underlying id (used as the filter value) and a
  // human-friendly display name (falling back to id when name is missing).
  const modelOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      if (!m.has(r.model_id))
        m.set(r.model_id, displayName(r.model_name, r.model_id));
    }
    return [...m.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const providerOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      if (!m.has(r.provider_id))
        m.set(r.provider_id, displayName(r.provider_name, r.provider_id));
    }
    return [...m.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        granularity: filters.granularity,
        limit: "1000",
        offset: "0",
      });
      if (filters.modelId) params.set("modelId", filters.modelId);
      if (filters.providerId) params.set("providerId", filters.providerId);
      if (filters.apiKeyId) params.set("apiKeyId", filters.apiKeyId);
      const fromMs = toEpochMs(filters.from);
      const toMs = toEpochMs(filters.to, true);
      if (fromMs !== undefined) params.set("from", String(fromMs));
      if (toMs !== undefined) params.set("to", String(toMs));

      const r = await apiFetch<{ data: AggregateReportRow[]; total: number }>(
        `/api/admin/aggregate-reports?${params}`,
      );
      setRows(r.data);
      setTotal(r.total);
    } catch {
      // Keep existing data on error
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadCharts = useCallback(async () => {
    setChartLoading(true);
    try {
      const params = new URLSearchParams({
        granularity: filters.granularity,
        limit: "1000",
        offset: "0",
      });
      if (filters.modelId) params.set("modelId", filters.modelId);
      if (filters.providerId) params.set("providerId", filters.providerId);
      if (filters.apiKeyId) params.set("apiKeyId", filters.apiKeyId);
      const fromMs = toEpochMs(filters.from);
      const toMs = toEpochMs(filters.to, true);
      if (fromMs !== undefined) params.set("from", String(fromMs));
      if (toMs !== undefined) params.set("to", String(toMs));

      const r = await apiFetch<{ data: AggregateReportRow[]; total: number }>(
        `/api/admin/aggregate-reports?${params}`,
      );
      setChartRows(r.data);
    } catch {
      // Keep existing chart data on error
    } finally {
      setChartLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadReport();
    void loadCharts();
  }, [loadReport, loadCharts]);

  // Effective group-by levels: always include period, optionally include user-selected
  // model/provider/apiKey (apiKey hidden for non-admin).
  const effectiveGroupBy = useMemo<GroupByLevel[]>(() => {
    return filters.groupBy.filter((l) => l !== "apiKey" || isAdmin);
  }, [filters.groupBy, isAdmin]);

  const fmtPeriod = (periodMs: number, gran: Granularity) => {
    const start = new Date(periodMs);
    let endMs: number;
    switch (gran) {
      case "hour":
        endMs = periodMs + 3_600_000 - 1;
        break;
      case "day":
        endMs = periodMs + 86_400_000 - 1;
        break;
      case "week":
        endMs = periodMs + 7 * 86_400_000 - 1;
        break;
      case "month": {
        // Month length varies — compute next month boundary in UTC.
        const next = new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
        );
        endMs = next.getTime() - 1;
        break;
      }
    }
    return `${formatDate(start)} – ${formatDate(new Date(endMs))}`;
  };

  const fmtTokens = (v: number) =>
    v >= 1_000_000
      ? `${(v / 1_000_000).toFixed(1)}M`
      : v >= 1_000
        ? `${(v / 1_000).toFixed(1)}K`
        : String(v);

  // Build lookup for API key names
  const apiKeyNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const k of apiKeyOptions) m.set(k.id, k.name);
    return m;
  }, [apiKeyOptions]);

  const chartKeyData = useMemo(() => {
    const m = new Map<
      string,
      {
        name: string;
        calls: number;
        input_tokens: number;
        cached_input_tokens: number;
        output_tokens: number;
      }
    >();
    for (const r of chartRows) {
      const k = displayName(
        r.api_key_name ?? apiKeyNameMap.get(r.api_key_id),
        r.api_key_id,
      );
      const existing = m.get(k);
      if (existing) {
        existing.calls += r.requests;
        existing.input_tokens += r.input_tokens;
        existing.cached_input_tokens += r.cached_input_tokens;
        existing.output_tokens += r.output_tokens;
      } else {
        m.set(k, {
          name: k,
          calls: r.requests,
          input_tokens: r.input_tokens,
          cached_input_tokens: r.cached_input_tokens,
          output_tokens: r.output_tokens,
        });
      }
    }
    return [...m.values()].sort((a, b) => b.calls - a.calls).slice(0, 10);
  }, [chartRows, apiKeyNameMap]);

  const chartModelData = useMemo(() => {
    const m = new Map<
      string,
      {
        name: string;
        calls: number;
        input_tokens: number;
        cached_input_tokens: number;
        output_tokens: number;
      }
    >();
    for (const r of chartRows) {
      const k = displayName(r.model_name, r.model_id);
      const existing = m.get(k);
      if (existing) {
        existing.calls += r.requests;
        existing.input_tokens += r.input_tokens;
        existing.cached_input_tokens += r.cached_input_tokens;
        existing.output_tokens += r.output_tokens;
      } else {
        m.set(k, {
          name: k,
          calls: r.requests,
          input_tokens: r.input_tokens,
          cached_input_tokens: r.cached_input_tokens,
          output_tokens: r.output_tokens,
        });
      }
    }
    return [...m.values()].sort((a, b) => b.calls - a.calls).slice(0, 10);
  }, [chartRows]);

  const chartProviderData = useMemo(() => {
    const m = new Map<
      string,
      {
        name: string;
        calls: number;
        input_tokens: number;
        cached_input_tokens: number;
        output_tokens: number;
      }
    >();
    for (const r of chartRows) {
      const k = displayName(r.provider_name, r.provider_id);
      const existing = m.get(k);
      if (existing) {
        existing.calls += r.requests;
        existing.input_tokens += r.input_tokens;
        existing.cached_input_tokens += r.cached_input_tokens;
        existing.output_tokens += r.output_tokens;
      } else {
        m.set(k, {
          name: k,
          calls: r.requests,
          input_tokens: r.input_tokens,
          cached_input_tokens: r.cached_input_tokens,
          output_tokens: r.output_tokens,
        });
      }
    }
    return [...m.values()].sort((a, b) => b.calls - a.calls).slice(0, 10);
  }, [chartRows]);

  // Format a period start as a compact label suitable for chart X-axis.
  const fmtPeriodShort = useCallback(
    (periodMs: number, gran: Granularity): string => {
      const d = new Date(periodMs);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const hh = String(d.getUTCHours()).padStart(2, "0");
      switch (gran) {
        case "hour":
          return `${mm}-${dd} ${hh}:00`;
        case "day":
          return `${yyyy}-${mm}-${dd}`;
        case "week":
          return `${yyyy}-${mm}-${dd}`;
        case "month":
          return `${yyyy}-${mm}`;
      }
    },
    [],
  );

  const chartPeriodData = useMemo(() => {
    const m = new Map<
      number,
      {
        period_start: number;
        name: string;
        calls: number;
        input_tokens: number;
        cached_input_tokens: number;
        output_tokens: number;
      }
    >();
    for (const r of chartRows) {
      const k = Number(r.period_start);
      const existing = m.get(k);
      if (existing) {
        existing.calls += r.requests;
        existing.input_tokens += r.input_tokens;
        existing.cached_input_tokens += r.cached_input_tokens;
        existing.output_tokens += r.output_tokens;
      } else {
        m.set(k, {
          period_start: k,
          name: fmtPeriodShort(k, filters.granularity),
          calls: r.requests,
          input_tokens: r.input_tokens,
          cached_input_tokens: r.cached_input_tokens,
          output_tokens: r.output_tokens,
        });
      }
    }
    // Sort chronologically ascending and cap to the most recent 20 periods.
    const sorted = [...m.values()].sort(
      (a, b) => a.period_start - b.period_start,
    );
    const tail = sorted.slice(-20);
    return tail.map(({ period_start: _ps, ...rest }) => {
      void _ps;
      return rest;
    });
  }, [chartRows, filters.granularity, fmtPeriodShort]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">{t("page.report.title")}</h1>
      </div>

      <ReportFiltersBar
        filters={filters}
        onChange={(f) => {
          setFilters(f);
        }}
        onRefresh={() => {
          loadReport();
          loadCharts();
        }}
        loading={loading}
        modelOptions={modelOptions}
        providerOptions={providerOptions}
        apiKeyOptions={apiKeyOptions}
        isAdmin={isAdmin}
      />

      {/* Charts */}
      {chartLoading && chartRows.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[200px] w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <RankBarChart title="Period Usage" data={chartPeriodData} />
          <RankBarChart title="Key Usage (period)" data={chartKeyData} />
          <RankBarChart title="Model Usage (period)" data={chartModelData} />
          <RankBarChart
            title="Provider Usage (period)"
            data={chartProviderData}
          />
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            {total === 0
              ? t("table.noData")
              : `Showing ${rows.length} aggregated rows (of ${total} total)`}
          </div>

          <GroupedReportTable
            rows={rows}
            levels={effectiveGroupBy}
            fmtPeriod={(periodMs) => fmtPeriod(periodMs, filters.granularity)}
            fmtTokens={fmtTokens}
          />
        </>
      )}
    </div>
  );
}
