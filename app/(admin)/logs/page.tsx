"use client";

import { useEffect, useState, useCallback } from "react";
import { DataTable } from "../_components/data-table";
import { apiFetch } from "../_components/api";
import { LogFiltersBar, type LogFilters } from "./_components/log-filters";
import type { RecentLogRow, UsageBucket } from "@/lib/metrics/queryRouter";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, XCircle } from "lucide-react";
import { useT } from "../_components/i18n-provider";

const PAGE_SIZES = [25, 50, 100] as const;

export default function LogsUsagePage() {
  const t = useT();
  const [tab, setTab] = useState<"logs" | "usage">("logs");

  // Logs state
  const [logs, setLogs] = useState<RecentLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [logsLoading, setLogsLoading] = useState(true);
  const [filters, setFilters] = useState<LogFilters>({
    search: "",
    status: "",
    modelId: "",
    providerId: "",
  });

  // Usage state
  const [usage, setUsage] = useState<UsageBucket[]>([]);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usagePage, setUsagePage] = useState(0);
  const [usagePageSize, setUsagePageSize] = useState(50);

  // Load logs
  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
        days: "7",
      });
      if (filters.search) params.set("search", filters.search);
      if (filters.status) params.set("status", filters.status);
      if (filters.modelId) params.set("modelId", filters.modelId);
      if (filters.providerId) params.set("providerId", filters.providerId);
      const r = await apiFetch<{ data: RecentLogRow[]; total: number }>(
        `/api/admin/logs?${params}`,
      );
      setLogs(r.data);
      setTotal(r.total);
    } finally {
      setLogsLoading(false);
    }
  }, [page, pageSize, filters]);

  // Load usage
  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    try {
      const r = await apiFetch<{ data: UsageBucket[] }>("/api/admin/usage");
      setUsage(r.data);
    } finally {
      setUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      if (tab === "logs") void loadLogs();
      else void loadUsage();
    });
  }, [tab, loadLogs, loadUsage]);

  // Reset page when filters change
  useEffect(() => {
    queueMicrotask(() => setPage(0));
  }, [filters, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const usageTotalPages = Math.max(1, Math.ceil(usage.length / usagePageSize));
  const usageDisplay = usage.slice(
    usagePage * usagePageSize,
    (usagePage + 1) * usagePageSize,
  );

  // Extract unique model/provider options from current data
  const modelOptions = [...new Set(logs.map((r) => r.model_id))].sort();
  const providerOptions = [
    ...new Set(
      logs.map((r) => r.provider_id ?? r.provider_name).filter(Boolean),
    ),
  ].sort() as string[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">{t("page.logs.title")}</h1>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "logs" | "usage")}>
        <TabsList variant="line">
          <TabsTrigger value="logs">{t("logs.tabs.requestLogs")}</TabsTrigger>
          <TabsTrigger value="usage">
            {t("logs.tabs.aggregatedUsage")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="space-y-3">
          <LogFiltersBar
            filters={filters}
            onChange={setFilters}
            onRefresh={loadLogs}
            loading={logsLoading}
            modelOptions={modelOptions}
            providerOptions={providerOptions}
          />

          {logsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">
                Showing {page * pageSize + 1}-
                {Math.min((page + 1) * pageSize, total)} of {total} logs
              </div>
              <DataTable
                idKey="id"
                expandable
                tableClassName="table-fixed"
                detailRender={(r) => (
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">
                        {t("logs.detail.stream")}{" "}
                      </span>
                      {r.stream ? "✓" : "✗"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("logs.detail.ttft")}{" "}
                      </span>
                      {r.ttft_ms == null ? "—" : `${r.ttft_ms}ms`}
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("logs.detail.inTokens")}{" "}
                      </span>
                      {String(r.input_tokens ?? "")}
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("logs.detail.outTokens")}{" "}
                      </span>
                      {String(r.output_tokens ?? "")}
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("logs.detail.outTps")}{" "}
                      </span>
                      {r.tps_out == null
                        ? "—"
                        : `${Number(r.tps_out).toFixed(1)}`}
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("logs.detail.userAgent")}{" "}
                      </span>
                      {r.user_agent ? String(r.user_agent).slice(0, 60) : "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("logs.detail.realModel")}{" "}
                      </span>
                      {r.real_model_id ? String(r.real_model_id) : "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("logs.detail.cachedIn")}{" "}
                      </span>
                      {String(r.cached_input_tokens ?? "")}
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("logs.detail.ip")}{" "}
                      </span>
                      {r.ip ? String(r.ip) : "—"}
                    </div>
                    {!!r.error_code && (
                      <div className="col-span-3">
                        <span className="text-muted-foreground">
                          {t("logs.detail.error")}{" "}
                        </span>
                        <span className="text-destructive">
                          {String(r.error_code)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                data={logs as unknown as Record<string, unknown>[]}
                columns={[
                  {
                    key: "ts",
                    label: t("logs.table.time"),
                    className: "w-[180px]",
                    render: (r) => (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(Number(r.ts)).toLocaleString()}
                        {r.aborted ? (
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                        ) : !r.completed ? (
                          <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        ) : null}
                      </span>
                    ),
                  },
                  {
                    key: "api_key_name",
                    label: t("logs.table.key"),
                    className: "w-[180px]",
                    render: (r) => (
                      <span className="font-mono text-xs truncate block">
                        {String(r.api_key_name ?? r.api_key_id ?? "—")}
                      </span>
                    ),
                  },
                  {
                    key: "model_id",
                    label: t("logs.table.model"),
                    className: "w-[130px]",
                  },
                  {
                    key: "provider_name",
                    label: "Provider",
                    className: "w-[110px]",
                    render: (r) =>
                      String(r.provider_name ?? r.provider_id ?? "—"),
                  },
                  {
                    key: "status",
                    label: t("logs.table.status"),
                    className: "w-[70px]",
                    render: (r) => {
                      const s = Number(r.status);
                      if (r.aborted)
                        return (
                          <Badge
                            variant="destructive"
                            className="text-[10px] gap-0.5"
                          >
                            <XCircle className="h-3 w-3" />
                            Aborted
                          </Badge>
                        );
                      if (s === 0)
                        return (
                          <Badge variant="secondary" className="text-[10px]">
                            In-flight
                          </Badge>
                        );
                      if (s >= 200 && s < 300)
                        return (
                          <Badge
                            variant="default"
                            className="text-[10px] bg-green-600"
                          >
                            {s}
                          </Badge>
                        );
                      return (
                        <Badge variant="destructive" className="text-[10px]">
                          {s}
                        </Badge>
                      );
                    },
                  },
                  {
                    key: "latency_ms",
                    label: t("logs.table.latency"),
                    className: "w-[75px]",
                    render: (r) => {
                      const fmtDuration = (ms: number) => {
                        if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
                        if (ms >= 10_000) return `${(ms / 1_000).toFixed(2)}s`;
                        return `${ms}ms`;
                      };
                      return (
                        <span className="text-xs tabular-nums">
                          {Number(r.status) === 0
                            ? "—"
                            : fmtDuration(Number(r.latency_ms))}
                        </span>
                      );
                    },
                  },
                  {
                    key: "input_tokens",
                    label: t("logs.table.inTokens"),
                    className: "w-[55px] text-right",
                    render: (r) => {
                      const n = Number(r.input_tokens ?? 0);
                      const fmt = (v: number) =>
                        v >= 1_000_000
                          ? `${(v / 1_000_000).toFixed(1)}M`
                          : v >= 1_000
                            ? `${(v / 1_000).toFixed(1)}K`
                            : String(v);
                      return (
                        <span className="text-xs tabular-nums">{fmt(n)}</span>
                      );
                    },
                  },
                  {
                    key: "cached_input_tokens",
                    label: t("logs.table.cachedTokens"),
                    className: "w-[60px] text-right",
                    render: (r) => {
                      const n = Number(r.cached_input_tokens ?? 0);
                      const fmt = (v: number) =>
                        v >= 1_000_000
                          ? `${(v / 1_000_000).toFixed(1)}M`
                          : v >= 1_000
                            ? `${(v / 1_000).toFixed(1)}K`
                            : String(v);
                      return (
                        <span className="text-xs tabular-nums">{fmt(n)}</span>
                      );
                    },
                  },
                  {
                    key: "output_tokens",
                    label: t("logs.table.outTokens"),
                    className: "w-[55px] text-right",
                    render: (r) => {
                      const n = Number(r.output_tokens ?? 0);
                      const fmt = (v: number) =>
                        v >= 1_000_000
                          ? `${(v / 1_000_000).toFixed(1)}M`
                          : v >= 1_000
                            ? `${(v / 1_000).toFixed(1)}K`
                            : String(v);
                      return (
                        <span className="text-xs tabular-nums">{fmt(n)}</span>
                      );
                    },
                  },
                  {
                    key: "ttft_ms",
                    label: t("logs.table.ttft"),
                    className: "w-[70px]",
                    render: (r) => {
                      const fmtDuration = (ms: number) => {
                        if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
                        if (ms >= 10_000) return `${(ms / 1_000).toFixed(2)}s`;
                        return `${ms}ms`;
                      };
                      return (
                        <span className="text-xs tabular-nums">
                          {r.ttft_ms == null
                            ? "—"
                            : fmtDuration(Number(r.ttft_ms))}
                        </span>
                      );
                    },
                  },
                  {
                    key: "user_agent",
                    label: "User-Agent",
                    render: (r) => (
                      <span
                        className="text-xs truncate block"
                        title={r.user_agent ? String(r.user_agent) : undefined}
                      >
                        {r.user_agent ? String(r.user_agent).slice(0, 40) : "—"}
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
                    {Array.from({ length: Math.min(totalPages, 7) }).map(
                      (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 7) {
                          pageNum = i;
                        } else if (page < 4) {
                          pageNum = i;
                        } else if (page > totalPages - 5) {
                          pageNum = totalPages - 7 + i;
                        } else {
                          pageNum = page - 3 + i;
                        }
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
                      },
                    )}
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
        </TabsContent>

        <TabsContent value="usage" className="space-y-3">
          {usageLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">
                Showing {usagePage * usagePageSize + 1}-
                {Math.min((usagePage + 1) * usagePageSize, usage.length)} of{" "}
                {usage.length} entries
              </div>
              <DataTable
                idKey="minute"
                tableClassName="table-fixed"
                data={usageDisplay as unknown as Record<string, unknown>[]}
                columns={[
                  {
                    key: "minute",
                    label: "Minute",
                    className: "w-[155px]",
                    render: (r) => (
                      <span className="text-xs whitespace-nowrap">
                        {new Date(Number(r.minute) * 60_000).toLocaleString()}
                      </span>
                    ),
                  },
                  { key: "model_id", label: "Model", className: "w-[130px]" },
                  {
                    key: "provider_id",
                    label: "Provider",
                    className: "w-[110px]",
                  },
                  {
                    key: "requests",
                    label: "Reqs",
                    className: "w-[50px] text-right",
                  },
                  {
                    key: "requests_ok",
                    label: "OK",
                    className: "w-[45px] text-right",
                  },
                  {
                    key: "requests_err",
                    label: "Err",
                    className: "w-[45px] text-right",
                  },
                  {
                    key: "input_tokens",
                    label: "In Tok",
                    className: "w-[60px] text-right",
                  },
                  {
                    key: "output_tokens",
                    label: "Out Tok",
                    className: "w-[60px] text-right",
                  },
                  {
                    key: "avg_ttft_ms",
                    label: "Avg TTFT",
                    className: "w-[70px]",
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
              {/* Usage Pagination */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Per page:</span>
                  <select
                    value={usagePageSize}
                    onChange={(e) => {
                      setUsagePageSize(Number(e.target.value));
                      setUsagePage(0);
                    }}
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
                          setUsagePage((p) => Math.max(0, p - 1));
                        }}
                        className={
                          usagePage === 0
                            ? "pointer-events-none opacity-50"
                            : ""
                        }
                      />
                    </PaginationItem>
                    {Array.from({
                      length: Math.min(usageTotalPages, 7),
                    }).map((_, i) => {
                      let pageNum: number;
                      if (usageTotalPages <= 7) {
                        pageNum = i;
                      } else if (usagePage < 4) {
                        pageNum = i;
                      } else if (usagePage > usageTotalPages - 5) {
                        pageNum = usageTotalPages - 7 + i;
                      } else {
                        pageNum = usagePage - 3 + i;
                      }
                      return (
                        <PaginationItem key={pageNum}>
                          <PaginationLink
                            href="#"
                            isActive={pageNum === usagePage}
                            onClick={(e) => {
                              e.preventDefault();
                              setUsagePage(pageNum);
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
                          setUsagePage((p) =>
                            Math.min(usageTotalPages - 1, p + 1),
                          );
                        }}
                        className={
                          usagePage >= usageTotalPages - 1
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
