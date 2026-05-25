"use client";

import { useEffect, useState } from "react";
import { DataTable } from "../_components/data-table";
import { apiFetch } from "../_components/api";
import type { ProviderQuotaSnapshotRow } from "@/lib/types";

export default function QuotaPage() {
  const [data, setData] = useState<ProviderQuotaSnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await apiFetch<{ data: ProviderQuotaSnapshotRow[] }>(
        "/api/admin/quota",
      );
      setData(r.data);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    queueMicrotask(() => void load());
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Quota Snapshots</h1>
      {loading && data.length === 0 ? (
        <div className="text-muted-foreground">Loading...</div>
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
