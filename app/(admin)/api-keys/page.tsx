"use client";

import { useEffect, useState } from "react";
import { DataTable } from "../_components/data-table";
import { FormDialog } from "../_components/form-dialog";
import { apiFetch } from "../_components/api";
import type { ApiKeyRow } from "@/lib/types";

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
      ) : (
        <DataTable
          idKey="id"
          data={data as unknown as Record<string, unknown>[]}
          columns={[
            { key: "id", label: "ID" },
            { key: "name", label: "Name" },
            {
              key: "enabled",
              label: "Enabled",
              render: (r) => (r.enabled ? "✓" : "✗"),
            },
            {
              key: "createdAt",
              label: "Created",
              render: (r) => new Date(r.createdAt as string).toLocaleString(),
            },
            {
              key: "lastUsedAt",
              label: "Last Used",
              render: (r) =>
                r.lastUsedAt
                  ? new Date(r.lastUsedAt as string).toLocaleString()
                  : "—",
            },
          ]}
          onDelete={async (id) => {
            await apiFetch(`/api/admin/api-keys/${id}`, { method: "DELETE" });
            await load();
          }}
          actions={(r) => (
            <button
              className="text-xs hover:underline"
              onClick={async () => {
                await apiFetch(`/api/admin/api-keys/${r.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ enabled: !r.enabled }),
                });
                await load();
              }}
            >
              {r.enabled ? "Disable" : "Enable"}
            </button>
          )}
        />
      )}
    </div>
  );
}
