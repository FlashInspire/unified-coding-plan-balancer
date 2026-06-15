"use client";

import { useEffect, useState, useCallback } from "react";
import { DataTable } from "../_components/data-table";
import { apiFetch } from "../_components/api";
import {
  ReportFiltersBar,
  type ReportFilters,
  type Granularity,
} from "./_components/report-filters";
import type { AggregateReportRow } from "@/lib/metrics/queryRouter";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "../_components/i18n-provider";
import { useSession } from "next-auth/react";

const PAGE_SIZES = [25, 50, 100] as const;

type SessionUser = {
  role?: string;
};

function toEpochMs(dateStr: string, endOfDay = false): number | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return undefined;
  if (endOfDay) {
    d.setUTCHours(23, 59, 59, 999);
  }
  return d.getTime();
}

export default function ReportPage() {
  const t = useT();
  const { data: session } = useSession();
  const isAdmin = (session?.user as SessionUser)?.role === "admin";

  const [rows, setRows] = useState<AggregateReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const [filters, setFilters] = useState<ReportFilters>({
    granularity: "day" as Granularity,
    modelId: "",
    providerId: "",
    apiKeyId: "",
    from: "",
    to: "",
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

  // Derive model/provider options from loaded rows
  const modelOptions = [...new Set(rows.map((r) => r.model_id))].sort();
  const providerOptions = [...new Set(rows.map((r) => r.provider_id))].sort();

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        granularity: filters.granularity,
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      if (filters.modelId) params.set("modelId", filters.modelId);
      if (filters.providerId) params.set("providerId", filters.providerId);
      if (filters.apiKeyId) params.set("apiKeyId", filters.apiKeyId);
      const fromMs = toEpochMs(filters.from);
      const toMs = toEpochMs(filters.to, true);
      if (fromMs) params.set("from", String(fromMs));
      if (toMs) params.set("to", String(toMs));

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
  }, [filters, page, pageSize]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadReport();
  }, [loadReport]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fmtPeriod = (periodMs: number, gran: Granularity) => {
    const d = new Date(periodMs);
    switch (gran) {
      case "hour":
        return d.toLocaleString(undefined, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      case "day":
        return d.toLocaleDateString(undefined, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
      case "week": {
        const end = new Date(periodMs + 6 * 86_400_000);
        return `${d.toLocaleDateString()} – ${end.toLocaleDateString()}`;
      }
      case "month":
        return d.toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
        });
    }
  };

  const fmtTokens = (v: number) =>
    v >= 1_000_000
      ? `${(v / 1_000_000).toFixed(1)}M`
      : v >= 1_000
        ? `${(v / 1_000).toFixed(1)}K`
        : String(v);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">{t("page.report.title")}</h1>
      </div>

      <ReportFiltersBar
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          setPage(0);
        }}
        onRefresh={loadReport}
        loading={loading}
        modelOptions={modelOptions}
        providerOptions={providerOptions}
        apiKeyOptions={apiKeyOptions}
        isAdmin={isAdmin}
      />

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
              : `Showing ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, total)} of ${total} entries`}
          </div>

          <DataTable
            idKey="period_start"
            tableClassName="table-fixed"
            data={rows as unknown as Record<string, unknown>[]}
            columns={[
              {
                key: "period_start",
                label: "Period",
                className: "w-[190px]",
                render: (r) => (
                  <span className="text-xs whitespace-nowrap">
                    {fmtPeriod(Number(r.period_start), filters.granularity)}
                  </span>
                ),
              },
              { key: "model_id", label: "Model", className: "w-[130px]" },
              {
                key: "provider_id",
                label: "Provider",
                className: "w-[120px]",
                render: (r) => (
                  <span className="text-xs truncate block">
                    {String(r.provider_id ?? "—")}
                  </span>
                ),
              },
              ...(isAdmin
                ? [
                    {
                      key: "api_key_id" as string,
                      label: "API Key",
                      className: "w-[120px]",
                      render: (r: Record<string, unknown>) => (
                        <span className="font-mono text-xs truncate block">
                          {String(r.api_key_id ?? "—")}
                        </span>
                      ),
                    },
                  ]
                : []),
              {
                key: "requests",
                label: "Reqs",
                className: "w-[55px] text-right",
                render: (r) => (
                  <span className="text-xs tabular-nums">
                    {Number(r.requests)}
                  </span>
                ),
              },
              {
                key: "requests_ok",
                label: "OK",
                className: "w-[50px] text-right",
                render: (r) => (
                  <Badge
                    variant="default"
                    className="text-[10px] bg-green-600 font-mono"
                  >
                    {Number(r.requests_ok)}
                  </Badge>
                ),
              },
              {
                key: "requests_err",
                label: "Err",
                className: "w-[50px] text-right",
                render: (r) => {
                  const n = Number(r.requests_err);
                  return n > 0 ? (
                    <Badge
                      variant="destructive"
                      className="text-[10px] font-mono"
                    >
                      {n}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">0</span>
                  );
                },
              },
              {
                key: "input_tokens",
                label: "In Tok",
                className: "w-[65px] text-right",
                render: (r) => (
                  <span className="text-xs tabular-nums">
                    {fmtTokens(Number(r.input_tokens))}
                  </span>
                ),
              },
              {
                key: "cached_input_tokens",
                label: "Cached",
                className: "w-[65px] text-right",
                render: (r) => (
                  <span className="text-xs tabular-nums">
                    {fmtTokens(Number(r.cached_input_tokens))}
                  </span>
                ),
              },
              {
                key: "output_tokens",
                label: "Out Tok",
                className: "w-[65px] text-right",
                render: (r) => (
                  <span className="text-xs tabular-nums">
                    {fmtTokens(Number(r.output_tokens))}
                  </span>
                ),
              },
              {
                key: "avg_ttft_ms",
                label: "Avg TTFT",
                className: "w-[75px]",
                render: (r) => (
                  <span className="text-xs tabular-nums">
                    {r.avg_ttft_ms == null
                      ? "—"
                      : `${Number(r.avg_ttft_ms).toFixed(0)}ms`}
                  </span>
                ),
              },
              {
                key: "avg_tps_out",
                label: "Avg TPS",
                className: "w-[65px]",
                render: (r) => (
                  <span className="text-xs tabular-nums">
                    {r.avg_tps_out == null
                      ? "—"
                      : `${Number(r.avg_tps_out).toFixed(1)}`}
                  </span>
                ),
              },
            ]}
          />

          {/* Pagination */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-7 rounded border border-input bg-background px-1.5 text-xs"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.max(0, p - 1));
                    }}
                    className={
                      page === 0 ? "pointer-events-none opacity-50" : ""
                    }
                  />
                </PaginationItem>
                {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) pageNum = i;
                  else if (page < 4) pageNum = i;
                  else if (page > totalPages - 5) pageNum = totalPages - 7 + i;
                  else pageNum = page - 3 + i;
                  return (
                    <PaginationItem key={pageNum}>
                      <PaginationLink
                        href="#"
                        isActive={pageNum === page}
                        onClick={(e) => {
                          e.preventDefault();
                          setPage(pageNum);
                        }}
                      >
                        {pageNum + 1}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.min(totalPages - 1, p + 1));
                    }}
                    className={
                      page >= totalPages - 1
                        ? "pointer-events-none opacity-50"
                        : ""
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </>
      )}
    </div>
  );
}
