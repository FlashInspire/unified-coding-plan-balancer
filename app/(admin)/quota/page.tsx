"use client";

import { useEffect, useState } from "react";
import { DataTable } from "../_components/data-table";
import { apiFetch } from "../_components/api";
import type { ProviderQuotaSnapshotRow, ProviderRow } from "@/lib/types";

export default function QuotaPage() {
  const [data, setData] = useState<ProviderQuotaSnapshotRow[]>([]);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [quotaRes, provRes] = await Promise.all([
        apiFetch<{ data: ProviderQuotaSnapshotRow[] }>("/api/admin/quota"),
        apiFetch<{ data: ProviderRow[] }>("/api/admin/providers"),
      ]);
      setData(quotaRes.data);
      setProviders(provRes.data);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    queueMicrotask(() => void load());
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const providerMap = new Map(providers.map((p) => [p.id, p]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Quota Snapshots</h1>
      {loading && data.length === 0 ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : (
        <DataTable
          idKey="providerId"
          data={data as unknown as Record<string, unknown>[]}
          columns={[
            { key: "providerId", label: "Provider" },
            {
              key: "usagePercent",
              label: "Usage %",
              render: (r) =>
                r.usagePercent == null
                  ? "—"
                  : `${Number(r.usagePercent).toFixed(1)}%`,
            },
            {
              key: "quotaRunningOut",
              label: "Status",
              render: (r) => {
                const prov = providerMap.get(r.providerId as string);
                if (prov?.quotaRunningOut) {
                  return (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Running out
                    </span>
                  );
                }
                return "—";
              },
            },
            {
              key: "fetchedAt",
              label: "Updated At",
              render: (r) =>
                r.fetchedAt
                  ? new Date(r.fetchedAt as string).toLocaleString()
                  : "—",
            },
          ]}
        />
      )}
    </div>
  );
}
