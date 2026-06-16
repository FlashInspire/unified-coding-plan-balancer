"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { DataTable } from "../_components/data-table";
import { LogFiltersBar, type LogFilters } from "./_components/log-filters";
import type { RecentLogRow } from "@/lib/metrics/queryRouter";
import type { ModelRow } from "@/lib/types";
import { apiFetch } from "../_components/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, XCircle, Radio } from "lucide-react";
import { useT } from "../_components/i18n-provider";
import { cn } from "@/lib/utils";
import { RankBarChart } from "../_components/rank-bar-chart";
import { useFormatDate } from "../_components/datetime-format-provider";

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fmtTokens(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

// ---------------------------------------------------------------------------
// Live Charts
// ---------------------------------------------------------------------------

function LiveCharts({
  logs,
  modelNameMap,
}: {
  logs: RecentLogRow[];
  modelNameMap: Map<string, string>;
}) {
  const keyData = useMemo(() => {
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
    for (const r of logs) {
      const k = String(r.api_key_name ?? r.api_key_id ?? "—");
      const existing = m.get(k);
      if (existing) {
        existing.calls++;
        existing.input_tokens += r.input_tokens ?? 0;
        existing.cached_input_tokens += r.cached_input_tokens ?? 0;
        existing.output_tokens += r.output_tokens ?? 0;
      } else {
        m.set(k, {
          name: k,
          calls: 1,
          input_tokens: r.input_tokens ?? 0,
          cached_input_tokens: r.cached_input_tokens ?? 0,
          output_tokens: r.output_tokens ?? 0,
        });
      }
    }
    return [...m.values()].sort((a, b) => b.calls - a.calls).slice(0, 10);
  }, [logs]);

  const modelData = useMemo(() => {
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
    for (const r of logs) {
      const k = String(r.model_id ?? "—");
      const display = modelNameMap.get(k) ?? k;
      const existing = m.get(k);
      if (existing) {
        existing.calls++;
        existing.input_tokens += r.input_tokens ?? 0;
        existing.cached_input_tokens += r.cached_input_tokens ?? 0;
        existing.output_tokens += r.output_tokens ?? 0;
      } else {
        m.set(k, {
          name: display,
          calls: 1,
          input_tokens: r.input_tokens ?? 0,
          cached_input_tokens: r.cached_input_tokens ?? 0,
          output_tokens: r.output_tokens ?? 0,
        });
      }
    }
    return [...m.values()].sort((a, b) => b.calls - a.calls).slice(0, 10);
  }, [logs, modelNameMap]);

  const providerData = useMemo(() => {
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
    for (const r of logs) {
      const k = String(r.provider_name ?? r.provider_id ?? "—");
      const existing = m.get(k);
      if (existing) {
        existing.calls++;
        existing.input_tokens += r.input_tokens ?? 0;
        existing.cached_input_tokens += r.cached_input_tokens ?? 0;
        existing.output_tokens += r.output_tokens ?? 0;
      } else {
        m.set(k, {
          name: k,
          calls: 1,
          input_tokens: r.input_tokens ?? 0,
          cached_input_tokens: r.cached_input_tokens ?? 0,
          output_tokens: r.output_tokens ?? 0,
        });
      }
    }
    return [...m.values()].sort((a, b) => b.calls - a.calls).slice(0, 10);
  }, [logs]);

  if (logs.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <RankBarChart title="Key Usage (current page)" data={keyData} />
      <RankBarChart title="Model Usage (current page)" data={modelData} />
      <RankBarChart title="Provider Usage (current page)" data={providerData} />
    </div>
  );
}

const PAGE_SIZE = 200;
const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS = 30_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildLiveUrl(filters: LogFilters, afterId?: number): string {
  const params = new URLSearchParams();
  params.set("limit", String(PAGE_SIZE));
  if (afterId != null) params.set("afterId", String(afterId));
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.modelId) params.set("modelId", filters.modelId);
  if (filters.providerId) params.set("providerId", filters.providerId);
  return `/api/admin/live?${params.toString()}`;
}

function buildStreamUrl(filters: LogFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.modelId) params.set("modelId", filters.modelId);
  if (filters.providerId) params.set("providerId", filters.providerId);
  return `/api/admin/live/stream?${params.toString()}`;
}

function buildFiltersUrl(filters: LogFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  return `/api/admin/live/filters?${params.toString()}`;
}

const fmtDuration = (ms: number) => {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 10_000) return `${(ms / 1_000).toFixed(2)}s`;
  return `${ms}ms`;
};

export default function LivePage() {
  const t = useT();
  const formatDate = useFormatDate();

  // ── Data state (cursor-based pagination) ──
  const [logs, setLogs] = useState<RecentLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // ── Filter state ──
  const [filters, setFilters] = useState<LogFilters>({
    search: "",
    status: "",
    modelId: "",
    providerId: "",
  });
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [providerOptions, setProviderOptions] = useState<string[]>([]);

  // ── Model id → display name map (for showing names instead of IDs) ──
  const [modelNameMap, setModelNameMap] = useState<Map<string, string>>(
    () => new Map(),
  );

  // ── SSE connection state ──
  const [connected, setConnected] = useState(false);

  // ── Refs for stable callbacks ──
  const sseAbortRef = useRef<AbortController | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(RECONNECT_BASE_MS);
  const connectRef = useRef<() => void>(() => {});
  const logsRef = useRef<RecentLogRow[]>([]);
  const filtersRef = useRef(filters);
  const lastFilterFetchRef = useRef(0);

  // Keep refs in sync
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);
  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  // ── Fetch initial page (no cursor) ──
  const fetchInitial = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const ac = new AbortController();
    fetchAbortRef.current = ac;

    setLoading(true);
    try {
      const resp = await fetch(buildLiveUrl(filtersRef.current), {
        signal: ac.signal,
      });
      if (!ac.signal.aborted && resp.ok) {
        const json = (await resp.json()) as {
          data: RecentLogRow[];
          total: number;
        };
        setLogs(json.data);
        setTotal(json.total);
        setHasMore(json.data.length >= PAGE_SIZE);
      }
    } catch {
      // Aborted or network error — ignore
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, []);

  // ── Fetch more (cursor-based) ──
  const fetchMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const lastId = logsRef.current[logsRef.current.length - 1]?.id;
    if (lastId == null) return;

    setLoadingMore(true);
    try {
      const resp = await fetch(buildLiveUrl(filtersRef.current, lastId));
      if (resp.ok) {
        const json = (await resp.json()) as {
          data: RecentLogRow[];
          total: number;
        };
        setLogs((prev) => [...prev, ...json.data]);
        setTotal(json.total);
        setHasMore(json.data.length >= PAGE_SIZE);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore]);

  // ── Infinite scroll: auto-load when bottom sentinel enters viewport ──
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchMore();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchMore]);

  // ── Fetch filter metadata ──
  const fetchFilterOptions = useCallback(async () => {
    try {
      const resp = await fetch(buildFiltersUrl(filtersRef.current));
      if (resp.ok) {
        const json = (await resp.json()) as {
          modelIds: string[];
          providerIds: string[];
        };
        setModelOptions(json.modelIds);
        setProviderOptions(json.providerIds);
      }
    } catch {
      // Best-effort
    }
  }, []);

  // ── SSE connection (pushes full records) ──
  const connect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    sseAbortRef.current?.abort();
    const ac = new AbortController();
    sseAbortRef.current = ac;
    setConnected(false);

    const url = buildStreamUrl(filtersRef.current);

    void (async () => {
      try {
        const resp = await fetch(url, { signal: ac.signal });
        if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
        const reader = resp.body.getReader();
        setConnected(true);
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
              const payload = JSON.parse(line.slice(5).trim()) as
                | { type: "record"; data: RecentLogRow }
                | { type: "heartbeat" };
              if (payload.type === "record") {
                const row = payload.data;
                setLogs((prev) => {
                  const idx = prev.findIndex((r) => r.id === row.id);
                  if (idx >= 0) {
                    // Update existing record in place
                    const next = [...prev];
                    next[idx] = row;
                    return next;
                  }
                  // New record → prepend (newest first)
                  return [row, ...prev];
                });
                // Refresh filter options at most once every 30s
                const now = Date.now();
                if (now - lastFilterFetchRef.current > 30_000) {
                  lastFilterFetchRef.current = now;
                  fetchFilterOptions();
                }
              }
              // heartbeat → no-op (connection alive)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep connectRef current
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // ── Load models once on mount to map model_id → displayName ──
  useEffect(() => {
    queueMicrotask(async () => {
      try {
        const r = await apiFetch<{ data: ModelRow[] }>("/api/admin/models");
        const map = new Map<string, string>();
        for (const m of r.data) map.set(m.id, m.displayName || m.id);
        setModelNameMap(map);
      } catch {
        // Best-effort: fall back to model_id display
      }
    });
  }, []);

  // ── Fetch initial + filters + connect SSE on mount / filter change ──
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchInitial();
    fetchFilterOptions();
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      sseAbortRef.current?.abort();
      fetchAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // ── Live elapsed timer for in-flight rows ──
  const [now, setNow] = useState(() => Date.now());
  const hasInFlight = logs.some((r) => !r.completed && !r.aborted);
  useEffect(() => {
    if (!hasInFlight) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [hasInFlight]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">{t("page.live.title")}</h1>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Radio
            className={cn(
              "h-3.5 w-3.5",
              connected
                ? "text-green-500 animate-pulse"
                : "text-muted-foreground",
            )}
          />
          <span>
            {connected ? t("live.status.connected") : t("common.loading")}
          </span>
        </div>
      </div>

      <LogFiltersBar
        filters={filters}
        onChange={setFilters}
        onRefresh={() => {
          fetchInitial();
          fetchFilterOptions();
          connect();
        }}
        loading={loading}
        modelOptions={modelOptions}
        providerOptions={providerOptions}
      />

      <LiveCharts logs={logs} modelNameMap={modelNameMap} />

      {loading && logs.length === 0 ? (
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
              : `${logs.length} of ${total} logs`}
          </div>
          <DataTable
            idKey="id"
            expandable
            tableClassName="table-fixed"
            detailRender={(r) => (
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">
                    {t("live.detail.stream")}{" "}
                  </span>
                  {r.stream ? "✓" : "✗"}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t("live.detail.ttft")}{" "}
                  </span>
                  {r.ttft_ms == null ? "—" : `${r.ttft_ms}ms`}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t("live.detail.inTokens")}{" "}
                  </span>
                  {String(r.input_tokens ?? "")}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t("live.detail.outTokens")}{" "}
                  </span>
                  {String(r.output_tokens ?? "")}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t("live.detail.outTps")}{" "}
                  </span>
                  {r.tps_out == null ? "—" : `${Number(r.tps_out).toFixed(1)}`}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t("live.detail.userAgent")}{" "}
                  </span>
                  {r.user_agent ? String(r.user_agent).slice(0, 60) : "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t("live.detail.realModel")}{" "}
                  </span>
                  {r.real_model_id ? String(r.real_model_id) : "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t("live.detail.cachedIn")}{" "}
                  </span>
                  {String(r.cached_input_tokens ?? "")}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t("live.detail.ip")}{" "}
                  </span>
                  {r.ip ? String(r.ip) : "—"}
                </div>
                {!!r.error_code && (
                  <div className="col-span-3">
                    <span className="text-muted-foreground">
                      {t("live.detail.error")}{" "}
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
                label: t("live.table.time"),
                className: "w-[180px]",
                render: (r) => (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(Number(r.ts))}
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
                label: t("live.table.key"),
                className: "w-[180px]",
                render: (r) => (
                  <span className="font-mono text-xs truncate block">
                    {String(r.api_key_name ?? r.api_key_id ?? "—")}
                  </span>
                ),
              },
              {
                key: "model_id",
                label: t("live.table.model"),
                className: "w-[180px]",
                render: (r) => {
                  const id = String(r.model_id ?? "");
                  const name = id ? (modelNameMap.get(id) ?? id) : "—";
                  return (
                    <span
                      className="text-xs truncate block"
                      title={id || undefined}
                    >
                      {name}
                    </span>
                  );
                },
              },
              {
                key: "provider_name",
                label: t("live.table.provider"),
                className: "w-[110px]",
                render: (r) => String(r.provider_name ?? r.provider_id ?? "—"),
              },
              {
                key: "status",
                label: t("live.table.status"),
                className: "w-[90px]",
                render: (r) => {
                  const s = Number(r.status);
                  if (r.aborted && s === 0)
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
                label: t("live.table.latency"),
                className: "w-[75px]",
                render: (r) => {
                  if (!r.completed && !r.aborted) {
                    return (
                      <span className="text-xs tabular-nums text-primary">
                        {fmtDuration(now - Number(r.ts))}
                      </span>
                    );
                  }
                  return (
                    <span className="text-xs tabular-nums">
                      {fmtDuration(Number(r.latency_ms))}
                    </span>
                  );
                },
              },
              {
                key: "input_tokens",
                label: t("live.table.inTokens"),
                className: "w-[55px] text-right",
                render: (r) => (
                  <span className="text-xs tabular-nums">
                    {fmtTokens(Number(r.input_tokens ?? 0))}
                  </span>
                ),
              },
              {
                key: "cached_input_tokens",
                label: t("live.table.cachedTokens"),
                className: "w-[60px] text-right",
                render: (r) => (
                  <span className="text-xs tabular-nums">
                    {fmtTokens(Number(r.cached_input_tokens ?? 0))}
                  </span>
                ),
              },
              {
                key: "output_tokens",
                label: t("live.table.outTokens"),
                className: "w-[55px] text-right",
                render: (r) => (
                  <span className="text-xs tabular-nums">
                    {fmtTokens(Number(r.output_tokens ?? 0))}
                  </span>
                ),
              },
              {
                key: "ttft_ms",
                label: t("live.table.ttft"),
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

          <div
            ref={loadMoreRef}
            className="flex justify-center py-4 min-h-[40px]"
          >
            {loadingMore && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("common.loading")}
              </span>
            )}
            {!hasMore && logs.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {t("live.allLoaded")}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
