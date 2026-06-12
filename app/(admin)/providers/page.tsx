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
import { Pencil, Power } from "lucide-react";
import type { ProviderRow } from "@/lib/types";

// ---------------------------------------------------------------------------
// Form field definitions
// ---------------------------------------------------------------------------

/** Basic info section — used for both create and edit. */
function basicFields(includeId: boolean) {
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
      label: "ID (slug)",
      type: "text",
      required: true,
    });
  }
  fields.push(
    { name: "name", label: "Name", type: "text", required: true },
    {
      name: "planStartTime",
      label: "Subscription Start Time",
      type: "datetime",
      defaultValue: "",
    },
  );
  return fields;
}

function endpointsTabs(
  openaiConfigured?: boolean,
  anthropicConfigured?: boolean,
) {
  return {
    type: "tabs" as const,
    tabs: [
      {
        label: `OpenAI${openaiConfigured ? " (Configured)" : ""}`,
        fields: [
          { name: "baseUrlOpenai", label: "Base URL", type: "text" as const },
          { name: "apiKeyOpenai", label: "API Key", type: "text" as const },
        ],
      },
      {
        label: `Anthropic${anthropicConfigured ? " (Configured)" : ""}`,
        fields: [
          {
            name: "baseUrlAnthropic",
            label: "Base URL",
            type: "text" as const,
          },
          { name: "apiKeyAnthropic", label: "API Key", type: "text" as const },
        ],
      },
    ],
  };
}

const USAGE_SECTION_FIELDS = [
  {
    name: "usageMode",
    label: "Usage Mode",
    type: "select" as const,
    options: [
      { value: "request", label: "Request" },
      { value: "token", label: "Token" },
    ],
    defaultValue: "request",
  },
  {
    name: "rollingQuota",
    label: "Rolling Quota",
    type: "number" as const,
  },
  {
    name: "weekQuota",
    label: "Week Quota",
    type: "number" as const,
  },
  {
    name: "monthQuota",
    label: "Month Quota",
    type: "number" as const,
  },
  {
    name: "rollingQuotaUsed",
    label: "Rolling Quota Used",
    type: "number" as const,
    readOnly: true,
  },
  {
    name: "weekQuotaUsed",
    label: "Week Quota Used",
    type: "number" as const,
    readOnly: true,
  },
  {
    name: "monthQuotaUsed",
    label: "Month Quota Used",
    type: "number" as const,
    readOnly: true,
  },
];

const CREATE_FIELDS = [
  { type: "section" as const, legend: "Basic" },
  ...basicFields(true),
  { type: "section" as const, legend: "Endpoints" },
  endpointsTabs(),
  { type: "section" as const, legend: "Usage Statistic" },
  ...USAGE_SECTION_FIELDS,
];

function buildEditFields(p: ProviderRow) {
  return [
    { type: "section" as const, legend: "Basic" },
    ...basicFields(false),
    { type: "section" as const, legend: "Endpoints" },
    endpointsTabs(!!p.baseUrlOpenai, !!p.baseUrlAnthropic),
    { type: "section" as const, legend: "Usage Statistic" },
    ...USAGE_SECTION_FIELDS,
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

function formatDuration(ms: number): string {
  if (ms <= 0) return "soon";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatNextReset(resetAt: Date | null): string {
  if (!resetAt) return "—";
  const diff = resetAt.getTime() - Date.now();
  if (diff < 24 * 60 * 60_000) {
    return formatDuration(diff);
  }
  return resetAt.toLocaleString();
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
      label: "Name",
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
      label: "Quota",
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
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs space-y-1">
              <div>
                Rolling:{" "}
                {rp != null
                  ? `${rp.toFixed(0)}% (${formatQuotaNum(p.rollingQuotaUsed)} / ${formatQuotaNum(p.rollingQuota!)})`
                  : `${formatQuotaNum(p.rollingQuotaUsed)} / ∞`}
              </div>
              <div>
                Week:{" "}
                {wp != null
                  ? `${wp.toFixed(0)}% (${formatQuotaNum(p.weekQuotaUsed)} / ${formatQuotaNum(p.weekQuota!)})`
                  : `${formatQuotaNum(p.weekQuotaUsed)} / ∞`}
              </div>
              <div>
                Month:{" "}
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
      label: "Endpoints",
      className: "w-[120px]",
      render: (row: Record<string, unknown>) => {
        const p = row as unknown as ProviderRow;
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            {p.baseUrlOpenai && (
              <Badge variant="default" className="text-[10px]">
                OpenAI
              </Badge>
            )}
            {p.baseUrlAnthropic && (
              <Badge variant="default" className="text-[10px]">
                Anthropic
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
          <h1 className="text-xl font-semibold">Providers</h1>
          <FormDialog
            title="New Provider"
            triggerLabel="+ New Provider"
            fields={CREATE_FIELDS}
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
          title={`Edit Provider: ${editRow?.id ?? ""}`}
          fields={editRow ? buildEditFields(editRow) : CREATE_FIELDS}
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
          submitLabel="Update"
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
          <div className="text-muted-foreground text-xs">No providers yet.</div>
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
                    title={p.enabled ? "Disable" : "Enable"}
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
              if (!confirm("Delete this provider?")) return;
              await handleDelete(id);
            }}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
