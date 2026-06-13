"use client";

import { useEffect, useState } from "react";
import { DataTable } from "../_components/data-table";
import { apiFetch } from "../_components/api";
import { useT } from "../_components/i18n-provider";
import type { ProviderQuotaSnapshotRow, ProviderRow } from "@/lib/types";

export default function QuotaPage() {
  const t = useT();
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
      <h1 className="text-xl font-semibold">{t("page.quota.title")}</h1>
      {loading && data.length === 0 ? (
        <div className="text-muted-foreground text-xs">{t("common.loading")}</div>
      ) : (
        <DataTable
          idKey="providerId"
          tableClassName="table-fixed"
          data={data as unknown as Record<string, unknown>[]}
          columns={[
            {
              key: "providerId",
              label: t("quota.table.provider"),
              className: "w-[120px]",
              render: (r) => {
                const prov = providerMap.get(r.providerId as string);
                return (
                  <span className="text-xs">
                    {prov?.name ?? String(r.providerId ?? "—")}
                  </span>
                );
              },
            },
            {
              key: "usagePercent",
              label: t("quota.table.usagePercent"),
              className: "w-[80px]",
              render: (r) =>
                r.usagePercent == null
                  ? "—"
                  : `${Number(r.usagePercent).toFixed(1)}%`,
            },
            {
              key: "quotaRunningOut",
              label: t("quota.table.status"),
              className: "w-[100px]",
              render: (r) => {
                const prov = providerMap.get(r.providerId as string);
                if (prov?.quotaRunningOut) {
                  return (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      {t("quota.status.runningOut")}
                    </span>
                  );
                }
                return "—";
              },
            },
            {
              key: "fetchedAt",
              label: t("quota.table.fetchedAt"),
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
