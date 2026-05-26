"use client";

import { useEffect, useState } from "react";
import { DataTable } from "../_components/data-table";
import { apiFetch } from "../_components/api";
import type { RecentLogRow, UsageBucket } from "@/lib/metrics/queryRouter";

type Tab = "logs" | "usage";

export default function LogsUsagePage() {
  const [tab, setTab] = useState<Tab>("logs");
  const [logs, setLogs] = useState<RecentLogRow[]>([]);
  const [usage, setUsage] = useState<UsageBucket[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      if (tab === "logs") {
        const r = await apiFetch<{ data: RecentLogRow[] }>(
          "/api/admin/logs?limit=200",
        );
        setLogs(r.data);
      } else {
        const r = await apiFetch<{ data: UsageBucket[] }>("/api/admin/usage");
        setUsage(r.data);
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [tab]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Logs & Usage</h1>
        <button onClick={load} className="text-sm hover:underline">
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setTab("logs")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "logs"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Request Logs
        </button>
        <button
          onClick={() => setTab("usage")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "usage"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Aggregated Usage
        </button>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : tab === "logs" ? (
        <DataTable
          idKey="id"
          expandable
          detailRender={(r) => (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <span className="text-muted-foreground">Stream: </span>
                {r.stream ? "✓" : "✗"}
              </div>
              <div>
                <span className="text-muted-foreground">TTFT: </span>
                {r.ttft_ms == null ? "—" : `${r.ttft_ms}ms`}
              </div>
              <div>
                <span className="text-muted-foreground">In Tokens: </span>
                {String(r.input_tokens ?? "")}
              </div>
              <div>
                <span className="text-muted-foreground">Out Tokens: </span>
                {String(r.output_tokens ?? "")}
              </div>
              <div>
                <span className="text-muted-foreground">Out TPS: </span>
                {r.tps_out == null ? "—" : `${Number(r.tps_out).toFixed(1)}`}
              </div>
              <div>
                <span className="text-muted-foreground">User-Agent: </span>
                {r.user_agent ? String(r.user_agent).slice(0, 60) : "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Real Model: </span>
                {r.real_model_id ? String(r.real_model_id) : "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Cached In: </span>
                {String(r.cached_input_tokens ?? "")}
              </div>
              <div>
                <span className="text-muted-foreground">IP: </span>
                {r.ip ? String(r.ip) : "—"}
              </div>
              {!!r.error_code && (
                <div className="col-span-3">
                  <span className="text-muted-foreground">Error: </span>
                  <span className="text-red-600">{String(r.error_code)}</span>
                </div>
              )}
            </div>
          )}
          data={logs as unknown as Record<string, unknown>[]}
          columns={[
            {
              key: "ts",
              label: "Time",
              render: (r) => new Date(Number(r.ts)).toLocaleString(),
            },
            {
              key: "api_key_name",
              label: "Key",
              render: (r) => String(r.api_key_name ?? r.api_key_id ?? "—"),
            },
            { key: "model_id", label: "Model" },
            {
              key: "provider_name",
              label: "Provider",
              render: (r) => String(r.provider_name ?? r.provider_id ?? "—"),
            },
            {
              key: "status",
              label: "Status",
              render: (r) => {
                const s = Number(r.status);
                if (s === 0)
                  return <span className="text-yellow-600">⏳ In-flight</span>;
                if (s >= 200 && s < 300)
                  return <span className="text-green-600">{s}</span>;
                return <span className="text-red-600">{s}</span>;
              },
            },
            {
              key: "latency_ms",
              label: "Latency",
              render: (r) =>
                Number(r.status) === 0 ? "—" : `${r.latency_ms}ms`,
            },
          ]}
        />
      ) : (
        <DataTable
          idKey="minute"
          data={usage as unknown as Record<string, unknown>[]}
          columns={[
            {
              key: "minute",
              label: "Minute",
              render: (r) =>
                new Date(Number(r.minute) * 60_000).toLocaleString(),
            },
            { key: "model_id", label: "Model" },
            { key: "provider_id", label: "Provider" },
            { key: "requests", label: "Reqs" },
            { key: "requests_ok", label: "OK" },
            { key: "requests_err", label: "Err" },
            { key: "input_tokens", label: "In Tok" },
            { key: "output_tokens", label: "Out Tok" },
            {
              key: "avg_ttft_ms",
              label: "Avg TTFT",
              render: (r) =>
                r.avg_ttft_ms == null
                  ? "—"
                  : `${Number(r.avg_ttft_ms).toFixed(0)}ms`,
            },
            {
              key: "avg_tps_out",
              label: "Avg TPS",
              render: (r) =>
                r.avg_tps_out == null
                  ? "—"
                  : `${Number(r.avg_tps_out).toFixed(1)}`,
            },
          ]}
        />
      )}
    </div>
  );
}
