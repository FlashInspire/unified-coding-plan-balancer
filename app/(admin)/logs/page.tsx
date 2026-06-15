"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { DataTable } from "../_components/data-table";
import { LogFiltersBar, type LogFilters } from "./_components/log-filters";
import type { RecentLogRow } from "@/lib/metrics/queryRouter";
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
import { Loader2, XCircle, Radio } from "lucide-react";
import { useT } from "../_components/i18n-provider";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [25, 50, 100] as const;
const MAX_ROWS = 2_000;
const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS = 30_000;

function buildStreamUrl(filters: LogFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.modelId) params.set("modelId", filters.modelId);
  if (filters.providerId) params.set("providerId", filters.providerId);
  return `/api/admin/logs/stream?${params.toString()}`;
}

export default function LogsPage() {
  const t = useT();

  const [logs, setLogs] = useState<RecentLogRow[]>([]);
  const [connected, setConnected] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [filters, setFilters] = useState<LogFilters>({
    search: "",
    status: "",
    modelId: "",
    providerId: "",
  });
  const [initialLoading, setInitialLoading] = useState(true);

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(RECONNECT_BASE_MS);
  const abortRef = useRef<AbortController | null>(null);
  const filtersRef = useRef(filters);
  const connectRef = useRef<() => void>(() => {});

  // Keep filtersRef current without triggering a re-render
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const mergeRows = useCallback((incoming: RecentLogRow[]) => {
    setLogs((prev) => {
      const existingIds = new Set(prev.map((r) => r.id));
      const newRows = incoming.filter((r) => !existingIds.has(r.id));
      if (newRows.length === 0) return prev;
      const merged = [...newRows, ...prev];
      return merged.length > MAX_ROWS ? merged.slice(0, MAX_ROWS) : merged;
    });
  }, []);

  const connect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setConnected(false);

    const url = buildStreamUrl(filtersRef.current);

    void (async () => {
      try {
        const resp = await fetch(url, { signal: ac.signal });
        if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
        const reader = resp.body.getReader();
        setConnected(true);
        setInitialLoading(false);
        reconnectDelay.current = RECONNECT_BASE_MS;

        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            try {
              const payload = JSON.parse(line.slice(5).trim()) as {
                rows?: RecentLogRow[];
                heartbeat?: boolean;
              };
              if (payload.rows && payload.rows.length > 0)
                mergeRows(payload.rows);
            } catch {
              // malformed event — skip
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
      setConnected(false);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectDelay.current = Math.min(
          reconnectDelay.current * 2,
          RECONNECT_MAX_MS,
        );
        connectRef.current();
      }, reconnectDelay.current);
    })();
  }, [mergeRows]);

  // Keep connectRef current so the reconnect callback always calls the latest version
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLogs([]);
    setPage(0);
    setInitialLoading(true);
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(0);
  }, [pageSize]);

  const totalPages = Math.max(1, Math.ceil(logs.length / pageSize));
  const pageRows = logs.slice(page * pageSize, (page + 1) * pageSize);

  const modelOptions = [...new Set(logs.map((r) => r.model_id))].sort();
  const providerOptions = [
    ...new Set(
      logs.map((r) => r.provider_id ?? r.provider_name).filter(Boolean),
    ),
  ].sort() as string[];

  const fmtDuration = (ms: number) => {
    if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
    if (ms >= 10_000) return `${(ms / 1_000).toFixed(2)}s`;
    return `${ms}ms`;
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
        <h1 className="text-sm font-semibold">{t("page.logs.title")}</h1>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Radio
            className={cn(
              "h-3.5 w-3.5",
              connected
                ? "text-green-500 animate-pulse"
                : "text-muted-foreground",
            )}
          />
          <span>{connected ? t("logs.live") : t("common.loading")}</span>
        </div>
      </div>

      <LogFiltersBar
        filters={filters}
        onChange={setFilters}
        onRefresh={() => {
          setLogs([]);
          setPage(0);
          setInitialLoading(true);
          connect();
        }}
        loading={!connected && initialLoading}
        modelOptions={modelOptions}
        providerOptions={providerOptions}
      />

      {initialLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            {logs.length === 0
              ? t("table.noData")
              : `Showing ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, logs.length)} of ${logs.length} logs (live)`}
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
                  {r.tps_out == null ? "—" : `${Number(r.tps_out).toFixed(1)}`}
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
            data={pageRows as unknown as Record<string, unknown>[]}
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
                render: (r) => String(r.provider_name ?? r.provider_id ?? "—"),
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
                render: (r) => (
                  <span className="text-xs tabular-nums">
                    {Number(r.status) === 0
                      ? "—"
                      : fmtDuration(Number(r.latency_ms))}
                  </span>
                ),
              },
              {
                key: "input_tokens",
                label: t("logs.table.inTokens"),
                className: "w-[55px] text-right",
                render: (r) => (
                  <span className="text-xs tabular-nums">
                    {fmtTokens(Number(r.input_tokens ?? 0))}
                  </span>
                ),
              },
              {
                key: "cached_input_tokens",
                label: t("logs.table.cachedTokens"),
                className: "w-[60px] text-right",
                render: (r) => (
                  <span className="text-xs tabular-nums">
                    {fmtTokens(Number(r.cached_input_tokens ?? 0))}
                  </span>
                ),
              },
              {
                key: "output_tokens",
                label: t("logs.table.outTokens"),
                className: "w-[55px] text-right",
                render: (r) => (
                  <span className="text-xs tabular-nums">
                    {fmtTokens(Number(r.output_tokens ?? 0))}
                  </span>
                ),
              },
              {
                key: "ttft_ms",
                label: t("logs.table.ttft"),
                className: "w-[70px]",
                render: (r) => (
                  <span className="text-xs tabular-nums">
                    {r.ttft_ms == null ? "—" : fmtDuration(Number(r.ttft_ms))}
                  </span>
                ),
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
