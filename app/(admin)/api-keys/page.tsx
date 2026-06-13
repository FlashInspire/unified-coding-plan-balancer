"use client";

import { useEffect, useState, useCallback } from "react";
import { DataTable } from "../_components/data-table";
import { FormDialog } from "../_components/form-dialog";
import { CircularProgress } from "../_components/circular-progress";
import { apiFetch } from "../_components/api";
import { useT } from "../_components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Pencil, Power } from "lucide-react";
import type { ApiKeyRow } from "@/lib/types";
import type { RecentLogRow } from "@/lib/metrics/queryRouter";

interface CreatedApiKey {
  id: string;
  name: string;
  plaintext: string;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Compute max quota usage % across rolling/week/month. Returns null if all unlimited. */
function maxQuotaPercent(k: ApiKeyRow): number | null {
  const dims: { used: number; quota: number | null | undefined }[] = [
    { used: k.tokensUsed, quota: k.rollingQuota },
    { used: k.tokensUsed, quota: k.weekQuota },
    { used: k.tokensUsed, quota: k.monthQuota },
  ];
  let max: number | null = null;
  for (const d of dims) {
    if (d.quota != null && d.quota > 0) {
      const pct = Math.min(100, (d.used / d.quota) * 100);
      if (max == null || pct > max) max = pct;
    }
  }
  return max;
}

function quotaTooltip(k: ApiKeyRow): string {
  const parts: string[] = [];
  const add = (label: string, q: number | null | undefined) => {
    if (q == null || q <= 0)
      parts.push(`${label}: ${formatTokens(k.tokensUsed)}/∞`);
    else
      parts.push(
        `${label}: ${formatTokens(k.tokensUsed)}/${formatTokens(q)} (${Math.min(100, (k.tokensUsed / q) * 100).toFixed(0)}%)`,
      );
  };
  add("Rolling", k.rollingQuota);
  add("Week", k.weekQuota);
  add("Month", k.monthQuota);
  return parts.join("\n");
}

export default function ApiKeysPage() {
  const t = useT();
  const [data, setData] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [editRow, setEditRow] = useState<ApiKeyRow | null>(null);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">{t("page.apiKeys.title")}</h1>
        <FormDialog
          title={t("apiKeys.dialog.createTitle")}
          triggerLabel={t("apiKeys.dialog.createTrigger")}
          fields={[
            { name: "name", label: t("apiKeys.form.name"), type: "text", required: true },
            {
              name: "rollingQuota",
              label: t("apiKeys.form.rollingQuota"),
              type: "number",
              required: false,
            },
            {
              name: "weekQuota",
              label: t("apiKeys.form.weekQuota"),
              type: "number",
              required: false,
            },
            {
              name: "monthQuota",
              label: t("apiKeys.form.monthQuota"),
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

      {/* Created key banner */}
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

      {/* Edit modal */}
      <FormDialog
        title={`Edit Key: ${editRow?.name ?? ""}`}
        fields={[
          {
            name: "name",
            label: "Name",
            type: "text" as const,
            required: true,
          },
          {
            name: "rollingQuota",
            label: "Rolling Token Quota (5h)",
            type: "number" as const,
          },
          {
            name: "weekQuota",
            label: "Weekly Token Quota (Mon-Sun)",
            type: "number" as const,
          },
          {
            name: "monthQuota",
            label: "Monthly Token Quota",
            type: "number" as const,
          },
        ]}
        open={editRow != null}
        onOpenChange={(o) => {
          if (!o) setEditRow(null);
        }}
        initialValues={
          editRow
            ? {
                name: editRow.name,
                rollingQuota: editRow.rollingQuota ?? "",
                weekQuota: editRow.weekQuota ?? "",
                monthQuota: editRow.monthQuota ?? "",
              }
            : undefined
        }
        submitLabel="Save"
        onSubmit={async (v) => {
          await apiFetch(`/api/admin/api-keys/${editRow!.id}`, {
            method: "PATCH",
            body: JSON.stringify(v),
          });
          setEditRow(null);
          await load();
        }}
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="text-muted-foreground text-xs">No API keys yet.</div>
      ) : (
        <DataTable
          idKey="id"
          expandable
          tableClassName="table-fixed"
          detailRender={(row) => {
            const k = row as unknown as ApiKeyRow;
            return <KeyCallLogs apiKeyId={k.id} />;
          }}
          data={
            [...data]
              .sort((a, b) =>
                a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1,
              )
              .map((d) => ({ ...d })) as unknown as Record<string, unknown>[]
          }
          columns={[
            {
              key: "name",
              label: t("apiKeys.table.name"),
              className: "w-[140px]",
              render: (r) => {
                const k = r as unknown as ApiKeyRow;
                return (
                  <span className="text-xs font-medium truncate block">
                    {k.name}
                  </span>
                );
              },
            },
            {
              key: "quota",
              label: t("apiKeys.table.quota"),
              className: "w-[80px]",
              render: (r) => {
                const k = r as unknown as ApiKeyRow;
                const pct = maxQuotaPercent(k);
                return (
                  <span
                    title={quotaTooltip(k)}
                    className="inline-flex items-center gap-1"
                  >
                    <CircularProgress value={pct} size={14} showValue={false} />
                    <span className="text-xs tabular-nums">
                      {pct != null ? `${Math.round(pct)}%` : "∞"}
                    </span>
                  </span>
                );
              },
            },
            {
              key: "lastUsedAt",
              label: t("apiKeys.table.lastUsed"),
              className: "w-[145px]",
              render: (r) => {
                const k = r as unknown as ApiKeyRow;
                return (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {k.lastUsedAt
                      ? new Date(
                          k.lastUsedAt as unknown as string,
                        ).toLocaleString()
                      : "—"}
                  </span>
                );
              },
            },
          ]}
          rowClassName={(row) => {
            const k = row as unknown as ApiKeyRow;
            return !k.enabled ? "opacity-50" : undefined;
          }}
          actions={(row) => {
            const k = row as unknown as ApiKeyRow;
            return (
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditRow(k);
                  }}
                  className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-accent"
                  title={t("apiKeys.action.edit")}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await apiFetch(`/api/admin/api-keys/${k.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ enabled: !k.enabled }),
                    });
                    await load();
                  }}
                  className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-accent"
                  title={k.enabled ? t("apiKeys.action.disable") : t("apiKeys.action.enable")}
                >
                  <Power
                    className={`h-3 w-3 ${
                      k.enabled ? "text-green-600" : "text-gray-400"
                    }`}
                  />
                </button>
              </div>
            );
          }}
          onDelete={async (id) => {
            const k = data.find((d) => d.id === id);
            if (!confirm(t("apiKeys.confirmDelete", { name: k?.name ?? id }))) return;
            await apiFetch(`/api/admin/api-keys/${id}`, { method: "DELETE" });
            await load();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expanded row: Recent Call Logs for a specific API key
// ---------------------------------------------------------------------------
function KeyCallLogs({ apiKeyId }: { apiKeyId: string }) {
  const t = useT();
  const [logs, setLogs] = useState<RecentLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch<{ data: RecentLogRow[]; total: number }>(
        `/api/admin/logs?limit=50&apiKeyId=${apiKeyId}`,
      );
      setLogs(r.data);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [apiKeyId]);

  useEffect(() => {
    queueMicrotask(() => void loadLogs());
  }, [loadLogs]);

  if (loading)
    return <div className="text-xs text-muted-foreground">{t("apiKeys.logs.loading")}</div>;
  if (logs.length === 0)
    return (
      <div className="text-xs text-muted-foreground italic">
        No calls recorded yet.
      </div>
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
          {t("apiKeys.logs.heading")}
        </span>
        <button
          className="text-xs text-muted-foreground hover:underline"
          onClick={loadLogs}
        >
          {t("apiKeys.logs.refresh")}
        </button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-2 py-2 text-left font-medium">{t("apiKeys.logs.time")}</th>
              <th className="px-2 py-2 text-left font-medium">{t("apiKeys.logs.model")}</th>
              <th className="px-2 py-2 text-left font-medium">{t("apiKeys.logs.provider")}</th>
              <th className="px-2 py-2 text-left font-medium">{t("apiKeys.logs.status")}</th>
              <th className="px-2 py-2 text-left font-medium">{t("apiKeys.logs.latency")}</th>
              <th className="px-2 py-2 text-left font-medium">{t("apiKeys.logs.inTokens")}</th>
              <th className="px-2 py-2 text-left font-medium">{t("apiKeys.logs.outTokens")}</th>
              <th className="px-2 py-2 text-left font-medium">{t("apiKeys.logs.ttft")}</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-2 py-2 whitespace-nowrap">
                  {new Date(r.ts).toLocaleString()}
                </td>
                <td className="px-2 py-2">{r.model_id}</td>
                <td className="px-2 py-2">
                  {r.provider_name ?? r.provider_id ?? "—"}
                </td>
                <td className="px-2 py-2">
                  {r.status === 0 ? (
                    <Badge variant="secondary" className="text-[10px]">
                      In-flight
                    </Badge>
                  ) : r.status >= 200 && r.status < 300 ? (
                    <Badge
                      variant="default"
                      className="text-[10px] bg-green-600"
                    >
                      {r.status}
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-[10px]">
                      {r.status}
                    </Badge>
                  )}
                </td>
                <td className="px-2 py-2">
                  {r.status === 0 ? "—" : `${r.latency_ms}ms`}
                </td>
                <td className="px-2 py-2">{r.input_tokens ?? "—"}</td>
                <td className="px-2 py-2">{r.output_tokens ?? "—"}</td>
                <td className="px-2 py-2">
                  {r.ttft_ms == null ? "—" : `${r.ttft_ms}ms`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
