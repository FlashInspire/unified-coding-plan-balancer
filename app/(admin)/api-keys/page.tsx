"use client";

import { useEffect, useState, useCallback } from "react";
import { Accordion } from "../_components/accordion";
import { FormDialog } from "../_components/form-dialog";
import { apiFetch } from "../_components/api";
import type { ApiKeyRow } from "@/lib/types";
import type { RecentLogRow } from "@/lib/metrics/queryRouter";

interface CreatedApiKey {
  id: string;
  name: string;
  plaintext: string;
}

export default function ApiKeysPage() {
  const [data, setData] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);

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
          className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${
            k.enabled ? "bg-green-500" : "bg-gray-400"
          }`}
          title={k.enabled ? "Enabled" : "Disabled"}
        />
        <div className="min-w-0">
          <span className="font-semibold text-sm">{k.name}</span>
          <span className="text-muted-foreground text-xs ml-2 font-mono">
            {k.id.slice(0, 8)}…
          </span>
        </div>
        <div className="ml-auto flex gap-4 text-xs text-muted-foreground shrink-0">
          <span>
            Created:{" "}
            {new Date(k.createdAt as unknown as string).toLocaleDateString()}
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
        <h1 className="text-2xl font-bold">API Keys</h1>
        <FormDialog
          title="New API Key"
          triggerLabel="+ New Key"
          fields={[
            { name: "name", label: "Name", type: "text", required: true },
          ]}
          onSubmit={async (v) => {
            const r = await apiFetch<{ data: CreatedApiKey }>(
              "/api/admin/api-keys",
              {
                method: "POST",
                body: JSON.stringify(v),
              },
            );
            setCreated(r.data);
            await load();
          }}
        />
      </div>
      {created && (
        <div className="rounded-md border-2 border-yellow-500 bg-yellow-50 p-4 dark:bg-yellow-950">
          <div className="font-semibold mb-2">
            Copy this key now — it will not be shown again:
          </div>
          <code className="block bg-black text-green-300 p-3 rounded text-xs break-all">
            {created.plaintext}
          </code>
          <button
            onClick={() => setCreated(null)}
            className="mt-3 text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}
      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : data.length === 0 ? (
        <div className="text-muted-foreground">No API keys yet.</div>
      ) : (
        <Accordion items={accordionItems} />
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

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const r = await apiFetch<{ data: RecentLogRow[] }>(
        `/api/admin/logs?limit=50&apiKeyId=${apiKey.id}`,
      );
      setLogs(r.data);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [apiKey.id]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  return (
    <div className="space-y-4 text-sm">
      {/* Actions */}
      <div className="flex gap-2">
        <button className="text-xs hover:underline" onClick={onToggleEnabled}>
          {apiKey.enabled ? "Disable" : "Enable"}
        </button>
        <button
          className="text-xs hover:underline text-destructive"
          onClick={onDelete}
        >
          Delete
        </button>
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
