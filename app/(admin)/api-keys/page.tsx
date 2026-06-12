"use client";

import { useEffect, useState, useCallback } from "react";
import { FormDialog } from "../_components/form-dialog";
import { apiFetch } from "../_components/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import type { ApiKeyRow } from "@/lib/types";
import type { RecentLogRow } from "@/lib/metrics/queryRouter";
import type { TokenUsageSummary } from "@/lib/metrics/queryRouter";

interface CreatedApiKey {
  id: string;
  name: string;
  plaintext: string;
}

function formatQuota(v: number | null | undefined): string {
  if (v == null || v <= 0) return "∞";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function ApiKeysPage() {
  const [data, setData] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    try {
      const r = await apiFetch<{ data: ApiKeyRow[] }>("/api/admin/api-keys");
      setData(r.data);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  const accordionItems = data.map((k) => ({
    id: k.id,
    header: (
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`inline-block h-2 w-2 rounded-full shrink-0 ${
            k.enabled ? "bg-green-500" : "bg-gray-400"
          }`}
          title={k.enabled ? "Enabled" : "Disabled"}
        />
        <div className="min-w-0 flex-1">
          <span className="font-medium text-sm">{k.name}</span>
          <span className="text-muted-foreground text-xs ml-2 font-mono">
            {k.id.slice(0, 8)}…
          </span>
        </div>
        <div className="ml-auto flex gap-4 text-xs text-muted-foreground shrink-0">
          <span title="Tokens used this period">
            Tokens: {formatTokens(k.tokensUsed)}
          </span>
          <span title="Rolling / Week / Month quota">
            Quota: {formatQuota(k.rollingQuota)}/{formatQuota(k.weekQuota)}/
            {formatQuota(k.monthQuota)}
          </span>
          <span>
            Last used:{" "}
            {k.lastUsedAt
              ? new Date(k.lastUsedAt as unknown as string).toLocaleString()
              : "—"}
          </span>
        </div>
      </div>
    ),
    body: (
      <KeyDetail
        apiKey={k}
        onToggleEnabled={async () => {
          await apiFetch(`/api/admin/api-keys/${k.id}`, {
            method: "PATCH",
            body: JSON.stringify({ enabled: !k.enabled }),
          });
          await load();
        }}
        onDelete={async () => {
          if (!confirm(`Delete API key "${k.name}"?`)) return;
          await apiFetch(`/api/admin/api-keys/${k.id}`, { method: "DELETE" });
          await load();
        }}
      />
    ),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">API Keys</h1>
        <FormDialog
          title="New API Key"
          triggerLabel="+ New Key"
          fields={[
            { name: "name", label: "Name", type: "text", required: true },
            {
              name: "rollingQuota",
              label: "Rolling Token Quota (5h)",
              type: "number",
              required: false,
            },
            {
              name: "weekQuota",
              label: "Weekly Token Quota (Mon-Sun)",
              type: "number",
              required: false,
            },
            {
              name: "monthQuota",
              label: "Monthly Token Quota",
              type: "number",
              required: false,
            },
          ]}
          onSubmit={async (v) => {
            const body: Record<string, unknown> = { name: v.name };
            if (v.rollingQuota) body.rollingQuota = Number(v.rollingQuota);
            if (v.weekQuota) body.weekQuota = Number(v.weekQuota);
            if (v.monthQuota) body.monthQuota = Number(v.monthQuota);
            const r = await apiFetch<{ data: CreatedApiKey }>(
              "/api/admin/api-keys",
              {
                method: "POST",
                body: JSON.stringify(body),
              },
            );
            setCreated(r.data);
            await load();
          }}
        />
      </div>
      {created && (
        <div className="rounded-lg border-2 border-yellow-500 bg-yellow-50 p-4 dark:bg-yellow-950">
          <div className="font-semibold mb-2 text-sm">
            Copy this key now — it will not be shown again:
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-black text-green-300 p-3 rounded text-xs break-all">
              {created.plaintext}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(created.plaintext);
              }}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <button
            onClick={() => setCreated(null)}
            className="mt-3 text-xs underline text-muted-foreground"
          >
            Dismiss
          </button>
        </div>
      )}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="text-muted-foreground text-sm">No API keys yet.</div>
      ) : (
        <div className="space-y-2">
          {data.map((k) => {
            const isOpen = openId === k.id;
            return (
              <div
                key={k.id}
                className="rounded-lg border bg-card overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : k.id)}
                  className="flex w-full items-center px-4 py-3 text-left hover:bg-accent/30 transition-colors"
                >
                  <div className="mr-2 text-muted-foreground">
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </div>
                  {accordionItems.find((a) => a.id === k.id)?.header}
                </button>
                {isOpen && (
                  <div className="border-t px-4 py-4 bg-muted/10">
                    {accordionItems.find((a) => a.id === k.id)?.body}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KeyDetail({
  apiKey,
  onToggleEnabled,
  onDelete,
}: {
  apiKey: ApiKeyRow;
  onToggleEnabled: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [logs, setLogs] = useState<RecentLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [tokenPeriod, setTokenPeriod] = useState<"day" | "week" | "month">(
    "day",
  );
  const [tokenUsage, setTokenUsage] = useState<TokenUsageSummary[]>([]);
  const [tokenLoading, setTokenLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const r = await apiFetch<{ data: RecentLogRow[]; total: number }>(
        `/api/admin/logs?limit=50&apiKeyId=${apiKey.id}`,
      );
      setLogs(r.data);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [apiKey.id]);

  const loadTokenUsage = useCallback(
    async (period: "day" | "week" | "month") => {
      setTokenLoading(true);
      try {
        const r = await apiFetch<{ data: TokenUsageSummary[] }>(
          `/api/admin/api-keys/${apiKey.id}/usage?period=${period}&months=3`,
        );
        setTokenUsage(r.data);
      } catch {
        setTokenUsage([]);
      } finally {
        setTokenLoading(false);
      }
    },
    [apiKey.id],
  );

  useEffect(() => {
    queueMicrotask(() => void loadLogs());
  }, [loadLogs]);

  useEffect(() => {
    queueMicrotask(() => void loadTokenUsage(tokenPeriod));
  }, [loadTokenUsage, tokenPeriod]);

  return (
    <div className="space-y-4 text-sm">
      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="xs" onClick={onToggleEnabled}>
          {apiKey.enabled ? "Disable" : "Enable"}
        </Button>
        <Button
          variant="ghost"
          size="xs"
          className="text-destructive"
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>

      {/* Quota Management */}
      <QuotaManager
        apiKey={apiKey}
        onSaved={onToggleEnabled /* triggers re-render via parent load */}
      />

      {/* Token Usage Summary */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
            Token Usage
          </span>
          <div className="flex gap-1">
            {(["day", "week", "month"] as const).map((p) => (
              <button
                key={p}
                className={`text-xs px-2 py-0.5 rounded ${
                  tokenPeriod === p
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:underline"
                }`}
                onClick={() => setTokenPeriod(p)}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
            <button
              className="text-xs text-muted-foreground hover:underline ml-2"
              onClick={() => void loadTokenUsage(tokenPeriod)}
            >
              Refresh
            </button>
          </div>
        </div>
        {tokenLoading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : tokenUsage.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            No token usage recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-2 py-1.5 text-left font-medium">Period</th>
                  <th className="px-2 py-1.5 text-right font-medium">
                    Requests
                  </th>
                  <th className="px-2 py-1.5 text-right font-medium">Input</th>
                  <th className="px-2 py-1.5 text-right font-medium">
                    Cached Input
                  </th>
                  <th className="px-2 py-1.5 text-right font-medium">Output</th>
                </tr>
              </thead>
              <tbody>
                {tokenUsage.map((r) => (
                  <tr key={r.period} className="border-b last:border-0">
                    <td className="px-2 py-1 whitespace-nowrap font-mono">
                      {r.period}
                    </td>
                    <td className="px-2 py-1 text-right">{r.requests}</td>
                    <td className="px-2 py-1 text-right">
                      {formatTokens(r.input_tokens)}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {formatTokens(r.cached_input_tokens)}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {formatTokens(r.output_tokens)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent call logs */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
            Recent Call Logs
          </span>
          <button
            className="text-xs text-muted-foreground hover:underline"
            onClick={loadLogs}
          >
            Refresh
          </button>
        </div>
        {logsLoading ? (
          <div className="text-xs text-muted-foreground">Loading logs…</div>
        ) : logs.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            No calls recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-2 py-1.5 text-left font-medium">Time</th>
                  <th className="px-2 py-1.5 text-left font-medium">Model</th>
                  <th className="px-2 py-1.5 text-left font-medium">
                    Provider
                  </th>
                  <th className="px-2 py-1.5 text-left font-medium">Status</th>
                  <th className="px-2 py-1.5 text-left font-medium">Latency</th>
                  <th className="px-2 py-1.5 text-left font-medium">
                    In Tokens
                  </th>
                  <th className="px-2 py-1.5 text-left font-medium">
                    Out Tokens
                  </th>
                  <th className="px-2 py-1.5 text-left font-medium">TTFT</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-2 py-1 whitespace-nowrap">
                      {new Date(r.ts).toLocaleString()}
                    </td>
                    <td className="px-2 py-1">{r.model_id}</td>
                    <td className="px-2 py-1">
                      {r.provider_name ?? r.provider_id ?? "—"}
                    </td>
                    <td className="px-2 py-1">
                      {r.status === 0 ? (
                        <span className="text-yellow-600">⏳</span>
                      ) : r.status >= 200 && r.status < 300 ? (
                        <span className="text-green-600">{r.status}</span>
                      ) : (
                        <span className="text-red-600">{r.status}</span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {r.status === 0 ? "—" : `${r.latency_ms}ms`}
                    </td>
                    <td className="px-2 py-1">{r.input_tokens ?? "—"}</td>
                    <td className="px-2 py-1">{r.output_tokens ?? "—"}</td>
                    <td className="px-2 py-1">
                      {r.ttft_ms == null ? "—" : `${r.ttft_ms}ms`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function QuotaManager({
  apiKey,
  onSaved,
}: {
  apiKey: ApiKeyRow;
  onSaved: () => void;
}) {
  const [rolling, setRolling] = useState(apiKey.rollingQuota?.toString() ?? "");
  const [week, setWeek] = useState(apiKey.weekQuota?.toString() ?? "");
  const [month, setMonth] = useState(apiKey.monthQuota?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/api-keys/${apiKey.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          rollingQuota: rolling === "" ? null : Number(rolling),
          weekQuota: week === "" ? null : Number(week),
          monthQuota: month === "" ? null : Number(month),
        }),
      });
      onSaved();
    } catch {
      alert("Failed to save quota");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
        Token Quota (empty = unlimited)
      </div>
      <div className="text-xs text-muted-foreground mb-2">
        Current usage: <strong>{formatTokens(apiKey.tokensUsed)}</strong> tokens
      </div>
      <div className="grid grid-cols-3 gap-3">
        <label className="block text-xs">
          <span className="text-muted-foreground">Rolling (5h)</span>
          <input
            type="number"
            min="0"
            className="mt-1 block w-full rounded border px-2 py-1 text-xs bg-background"
            placeholder="∞"
            value={rolling}
            onChange={(e) => setRolling(e.target.value)}
          />
        </label>
        <label className="block text-xs">
          <span className="text-muted-foreground">Week (Mon-Sun)</span>
          <input
            type="number"
            min="0"
            className="mt-1 block w-full rounded border px-2 py-1 text-xs bg-background"
            placeholder="∞"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
          />
        </label>
        <label className="block text-xs">
          <span className="text-muted-foreground">Month</span>
          <input
            type="number"
            min="0"
            className="mt-1 block w-full rounded border px-2 py-1 text-xs bg-background"
            placeholder="∞"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
      </div>
      <button
        className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? "Saving…" : "Save Quota"}
      </button>
    </div>
  );
}
