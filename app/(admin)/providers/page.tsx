"use client";

import { useEffect, useState } from "react";
import { DataTable } from "../_components/data-table";
import { FormDialog } from "../_components/form-dialog";
import { CircularProgress } from "../_components/circular-progress";
import { apiFetch } from "../_components/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useT } from "../_components/i18n-provider";
import { Pencil, Power, RotateCcw } from "lucide-react";
import type { ProviderRow } from "@/lib/types";

// ---------------------------------------------------------------------------
// Form field definitions
// ---------------------------------------------------------------------------

/** Basic info section — used for both create and edit. */
function basicFields(includeId: boolean, t: (key: string) => string) {
  const fields: Array<{
    name: string;
    label: string;
    type: "text" | "datetime";
    required?: boolean;
    defaultValue?: string;
    placeholder?: string;
  }> = [];
  if (includeId) {
    fields.push({
      name: "id",
      label: t("providers.form.id"),
      type: "text",
      required: true,
    });
  }
  fields.push(
    {
      name: "name",
      label: t("providers.form.name"),
      type: "text",
      required: true,
    },
    {
      name: "planStartTime",
      label: t("providers.form.planStartTime"),
      type: "datetime",
      defaultValue: "",
    },
  );
  return fields;
}

function endpointsTabs(
  openaiConfigured?: boolean,
  anthropicConfigured?: boolean,
  t: (key: string) => string = (k) => k,
) {
  return {
    type: "tabs" as const,
    tabs: [
      {
        label: `${t("providers.tab.openai")}${openaiConfigured ? t("providers.tab.configured") : ""}`,
        fields: [
          {
            name: "baseUrlOpenai",
            label: t("providers.form.baseUrl"),
            type: "text" as const,
          },
          {
            name: "apiKeyOpenai",
            label: t("providers.form.apiKey"),
            type: "text" as const,
          },
        ],
      },
      {
        label: `${t("providers.tab.anthropic")}${anthropicConfigured ? t("providers.tab.configured") : ""}`,
        fields: [
          {
            name: "baseUrlAnthropic",
            label: t("providers.form.baseUrl"),
            type: "text" as const,
          },
          {
            name: "apiKeyAnthropic",
            label: t("providers.form.apiKey"),
            type: "text" as const,
          },
        ],
      },
    ],
  };
}

function usageSectionFields(t: (key: string) => string) {
  return [
    {
      name: "usageMode",
      label: t("providers.form.usageMode"),
      type: "select" as const,
      options: [
        { value: "request", label: t("providers.form.usageMode.request") },
        { value: "token", label: t("providers.form.usageMode.token") },
      ],
      defaultValue: "request",
    },
    {
      name: "rollingQuota",
      label: t("providers.form.rollingQuota"),
      type: "number" as const,
    },
    {
      name: "weekQuota",
      label: t("providers.form.weekQuota"),
      type: "number" as const,
    },
    {
      name: "monthQuota",
      label: t("providers.form.monthQuota"),
      type: "number" as const,
    },
    {
      name: "rollingQuotaUsed",
      label: t("providers.form.rollingQuotaUsed"),
      type: "number" as const,
      readOnly: true,
    },
    {
      name: "weekQuotaUsed",
      label: t("providers.form.weekQuotaUsed"),
      type: "number" as const,
      readOnly: true,
    },
    {
      name: "monthQuotaUsed",
      label: t("providers.form.monthQuotaUsed"),
      type: "number" as const,
      readOnly: true,
    },
  ];
}

function createFields(t: (key: string) => string) {
  return [
    { type: "section" as const, legend: t("providers.section.basic") },
    ...basicFields(true, t),
    { type: "section" as const, legend: t("providers.section.endpoints") },
    endpointsTabs(undefined, undefined, t),
    { type: "section" as const, legend: t("providers.section.usageStatistic") },
    ...usageSectionFields(t),
  ];
}

function buildEditFields(p: ProviderRow, t: (key: string) => string) {
  return [
    { type: "section" as const, legend: t("providers.section.basic") },
    ...basicFields(false, t),
    { type: "section" as const, legend: t("providers.section.endpoints") },
    endpointsTabs(!!p.baseUrlOpenai, !!p.baseUrlAnthropic, t),
    { type: "section" as const, legend: t("providers.section.usageStatistic") },
    ...usageSectionFields(t),
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format quota numbers using decimal units (1K = 1000, 1M = 1000000). */
function formatQuotaNum(n: number): string {
  if (n >= 1_000_000_000) {
    const v = n / 1_000_000_000;
    return `${v % 1 === 0 ? v : v.toFixed(1).replace(/\.0$/, "")}B`;
  }
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v % 1 === 0 ? v : v.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return `${v % 1 === 0 ? v : v.toFixed(1).replace(/\.0$/, "")}K`;
  }
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function quotaPct(used: number, quota: number | null): number | null {
  if (quota == null || quota <= 0) return null;
  return Math.min(100, (used / quota) * 100);
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ProvidersPage() {
  const [data, setData] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState<ProviderRow | null>(null);
  const t = useT();

  async function load() {
    setLoading(true);
    try {
      const r = await apiFetch<{ data: ProviderRow[] }>("/api/admin/providers");
      setData(r.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  async function handleDelete(id: string) {
    await apiFetch(`/api/admin/providers/${id}`, { method: "DELETE" });
    await load();
  }

  async function handleClearRunningOut(row: ProviderRow) {
    await apiFetch(`/api/admin/providers/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ quotaRunningOut: false }),
    });
    await load();
  }

  async function handleToggle(row: ProviderRow) {
    await apiFetch(`/api/admin/providers/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !row.enabled }),
    });
    await load();
  }

  // -----------------------------------------------------------------------
  // Table columns
  // -----------------------------------------------------------------------

  const columns = [
    {
      key: "name",
      label: t("providers.table.name"),
      className: "w-[180px]",
      render: (row: Record<string, unknown>) => {
        const p = row as unknown as ProviderRow;
        return (
          <div className="flex items-center gap-2">
            <span className="font-medium text-xs">{p.name}</span>
          </div>
        );
      },
    },
    {
      key: "quota",
      label: t("providers.table.quota"),
      className: "w-[100px]",
      render: (row: Record<string, unknown>) => {
        const p = row as unknown as ProviderRow;
        const rp = quotaPct(p.rollingQuotaUsed, p.rollingQuota);
        const wp = quotaPct(p.weekQuotaUsed, p.weekQuota);
        const mp = quotaPct(p.monthQuotaUsed, p.monthQuota);
        const maxPct = [rp, wp, mp]
          .filter((v): v is number => v != null)
          .reduce((a, b) => Math.max(a, b), 0);
        const anyQuota = rp != null || wp != null || mp != null;

        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 cursor-default">
                <CircularProgress
                  value={anyQuota ? maxPct : null}
                  size={18}
                  showValue={false}
                />
                <span className="text-xs tabular-nums">
                  {anyQuota ? `${Math.round(maxPct)}%` : "∞"}
                </span>
                {p.quotaRunningOut && (
                  <Badge
                    variant="destructive"
                    className="text-[9px] px-1 py-0 h-4"
                  >
                    {t("providers.quota.runningOut")}
                  </Badge>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs space-y-1">
              <div>
                {t("providers.quota.rolling")}{" "}
                {rp != null
                  ? `${rp.toFixed(0)}% (${formatQuotaNum(p.rollingQuotaUsed)} / ${formatQuotaNum(p.rollingQuota!)})`
                  : `${formatQuotaNum(p.rollingQuotaUsed)} / ∞`}
              </div>
              <div>
                {t("providers.quota.week")}{" "}
                {wp != null
                  ? `${wp.toFixed(0)}% (${formatQuotaNum(p.weekQuotaUsed)} / ${formatQuotaNum(p.weekQuota!)})`
                  : `${formatQuotaNum(p.weekQuotaUsed)} / ∞`}
              </div>
              <div>
                {t("providers.quota.month")}{" "}
                {mp != null
                  ? `${mp.toFixed(0)}% (${formatQuotaNum(p.monthQuotaUsed)} / ${formatQuotaNum(p.monthQuota!)})`
                  : `${formatQuotaNum(p.monthQuotaUsed)} / ∞`}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      key: "endpoints",
      label: t("providers.table.endpoints"),
      className: "w-[120px]",
      render: (row: Record<string, unknown>) => {
        const p = row as unknown as ProviderRow;
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            {p.baseUrlOpenai && (
              <Badge variant="default" className="text-[10px]">
                {t("providers.endpoint.openai")}
              </Badge>
            )}
            {p.baseUrlAnthropic && (
              <Badge variant="default" className="text-[10px]">
                {t("providers.endpoint.anthropic")}
              </Badge>
            )}
            {!p.baseUrlOpenai && !p.baseUrlAnthropic && (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
        );
      },
    },
  ];

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold">{t("page.providers.title")}</h1>
          <FormDialog
            title={t("providers.dialog.createTitle")}
            triggerLabel={t("providers.dialog.createTrigger")}
            fields={createFields(t)}
            wide
            onSubmit={async (v) => {
              await apiFetch("/api/admin/providers", {
                method: "POST",
                body: JSON.stringify(v),
              });
              await load();
            }}
          />
        </div>

        {/* Edit dialog (controlled) */}
        <FormDialog
          title={t("providers.dialog.editTitle", { id: editRow?.id ?? "" })}
          fields={editRow ? buildEditFields(editRow, t) : createFields(t)}
          wide
          open={editRow != null}
          onOpenChange={(o) => {
            if (!o) setEditRow(null);
          }}
          initialValues={
            editRow
              ? {
                  ...editRow,
                  planStartTime: editRow.planStartTime
                    ? new Date(editRow.planStartTime).toISOString()
                    : "",
                }
              : undefined
          }
          submitLabel={t("dialog.update")}
          onSubmit={async (v) => {
            await apiFetch(`/api/admin/providers/${editRow!.id}`, {
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
          <div className="text-muted-foreground text-xs">
            {t("providers.empty")}
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={
              [...data]
                .sort((a, b) =>
                  a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1,
                )
                .map((d) => ({ ...d })) as unknown as Record<string, unknown>[]
            }
            idKey="id"
            tableClassName="table-fixed"
            rowClassName={(row) => {
              const p = row as unknown as ProviderRow;
              return !p.enabled ? "opacity-50" : undefined;
            }}
            actions={(row) => {
              const p = row as unknown as ProviderRow;
              return (
                <>
                  {p.quotaRunningOut && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => void handleClearRunningOut(p)}
                      title={t("providers.action.clearRunningOut")}
                    >
                      <RotateCcw className="h-3 w-3 text-red-500" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setEditRow(p)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => void handleToggle(p)}
                    title={
                      p.enabled
                        ? t("providers.action.disable")
                        : t("providers.action.enable")
                    }
                  >
                    <Power
                      className={`h-3 w-3 ${
                        p.enabled ? "text-green-600" : "text-muted-foreground"
                      }`}
                    />
                  </Button>
                </>
              );
            }}
            onDelete={async (id) => {
              if (!confirm(t("providers.confirmDelete"))) return;
              await handleDelete(id);
            }}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
