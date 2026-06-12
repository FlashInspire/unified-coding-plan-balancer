"use client";

import { useEffect, useState } from "react";
import { FormDialog } from "../_components/form-dialog";
import { apiFetch } from "../_components/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import type { ProviderRow } from "@/lib/types";

const PROVIDER_FIELDS = [
  { name: "id", label: "ID (slug)", type: "text" as const, required: true },
  { name: "name", label: "Name", type: "text" as const, required: true },
  // OpenAI endpoint
  {
    name: "baseUrlOpenai",
    label: "OpenAI Base URL",
    type: "text" as const,
  },
  {
    name: "apiKeyOpenai",
    label: "OpenAI API Key",
    type: "text" as const,
  },
  // Anthropic endpoint
  {
    name: "baseUrlAnthropic",
    label: "Anthropic Base URL",
    type: "text" as const,
  },
  {
    name: "apiKeyAnthropic",
    label: "Anthropic API Key",
    type: "text" as const,
  },
  {
    name: "headersTemplate",
    label: "Extra Headers (JSON)",
    type: "json" as const,
    defaultValue: "{}",
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
    name: "rollingQuotaUsed",
    label: "Rolling Quota Used",
    type: "number" as const,
  },
  {
    name: "weekQuotaUsed",
    label: "Week Quota Used",
    type: "number" as const,
  },
  {
    name: "monthQuota",
    label: "Month Quota",
    type: "number" as const,
  },
  {
    name: "monthQuotaUsed",
    label: "Month Quota Used",
    type: "number" as const,
  },
  {
    name: "rollingCacheInputTokensUsed",
    label: "Rolling Cache Input Tokens Used",
    type: "number" as const,
  },
  {
    name: "rollingOutputTokensUsed",
    label: "Rolling Output Tokens Used",
    type: "number" as const,
  },
  {
    name: "weekCacheInputTokensUsed",
    label: "Week Cache Input Tokens Used",
    type: "number" as const,
  },
  {
    name: "weekOutputTokensUsed",
    label: "Week Output Tokens Used",
    type: "number" as const,
  },
  {
    name: "monthCacheInputTokensUsed",
    label: "Month Cache Input Tokens Used",
    type: "number" as const,
  },
  {
    name: "monthOutputTokensUsed",
    label: "Month Output Tokens Used",
    type: "number" as const,
  },
  {
    name: "planStartTime",
    label: "Plan Start Time (anchor for rolling/monthly resets)",
    type: "text" as const,
    defaultValue: "",
  },
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
    name: "enabled",
    label: "Enabled",
    type: "boolean" as const,
    defaultValue: true,
  },
  {
    name: "quotaRunningOut",
    label: "Quota Running Out",
    type: "boolean" as const,
    defaultValue: false,
  },
];

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

function formatQuotaCompact(used: number, quota: number | null): string {
  if (quota == null || quota <= 0) return `${formatQuotaNum(used)}/∞`;
  const pct = Math.min(100, (used / quota) * 100);
  return `${formatQuotaNum(used)}/${formatQuotaNum(quota)} (${pct.toFixed(0)}%)`;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "即将";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m 后`;
  if (m > 0) return `${m}m 后`;
  return "<1m 后";
}

function formatNextReset(resetAt: Date | null): string {
  if (!resetAt) return "—";
  const diff = resetAt.getTime() - Date.now();
  if (diff < 24 * 60 * 60_000) {
    return formatDuration(diff);
  }
  return resetAt.toLocaleString();
}

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

export default function ProvidersPage() {
  const [data, setData] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState<ProviderRow | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

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
    if (!confirm("Delete this provider?")) return;
    await apiFetch(`/api/admin/providers/${id}`, { method: "DELETE" });
    await load();
  }

  const accordionItems = data.map((p) => ({
    id: p.id,
    header: (
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`inline-block h-2 w-2 rounded-full shrink-0 ${
            p.enabled ? "bg-green-500" : "bg-gray-400"
          }`}
          title={p.enabled ? "Enabled" : "Disabled"}
        />
        <div className="min-w-0 flex-1">
          <span className="font-medium text-sm">{p.name}</span>
          <span className="text-muted-foreground text-xs ml-2 font-mono">
            {p.id}
          </span>
          {p.quotaRunningOut && (
            <Badge
              variant="secondary"
              className="text-[10px] bg-amber-100 text-amber-800 ml-2"
            >
              Running out
            </Badge>
          )}
        </div>
        <div className="ml-auto flex gap-3 text-xs text-muted-foreground shrink-0">
          <span title="Rolling">
            R:{formatQuotaCompact(p.rollingQuotaUsed, p.rollingQuota)}
          </span>
          <span title="Weekly">
            W:{formatQuotaCompact(p.weekQuotaUsed, p.weekQuota)}
          </span>
          <span title="Monthly">
            M:{formatQuotaCompact(p.monthQuotaUsed, p.monthQuota)}
          </span>
        </div>
      </div>
    ),
    body: (
      <div className="space-y-4 text-sm">
        {/* Endpoints info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="border rounded-md p-3 space-y-2 bg-muted/30">
            <div className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
              OpenAI Endpoint
            </div>
            {p.baseUrlOpenai ? (
              <>
                <div>
                  <div className="text-xs text-muted-foreground">Base URL</div>
                  <div className="font-mono truncate">{p.baseUrlOpenai}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">API Key</div>
                  <div className="font-mono">
                    {maskKey(p.apiKeyOpenai ?? "")}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground italic">
                Not configured
              </div>
            )}
          </div>
          <div className="border rounded-md p-3 space-y-2 bg-muted/30">
            <div className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
              Anthropic Endpoint
            </div>
            {p.baseUrlAnthropic ? (
              <>
                <div>
                  <div className="text-xs text-muted-foreground">Base URL</div>
                  <div className="font-mono truncate">{p.baseUrlAnthropic}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">API Key</div>
                  <div className="font-mono">
                    {maskKey(p.apiKeyAnthropic ?? "")}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground italic">
                Not configured
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Headers</div>
            <div className="font-mono truncate">{p.headersTemplate || "—"}</div>
          </div>
        </div>

        {/* Quota details */}
        <div className="border rounded-md p-3 space-y-2 bg-muted/30">
          <div className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
            Quota {p.usageMode === "token" ? "(Token Mode)" : "(Request Mode)"}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <QuotaDetail
              label="Rolling"
              used={p.rollingQuotaUsed}
              quota={p.rollingQuota}
              resetAt={
                p.rollingQuotaResetAt ? new Date(p.rollingQuotaResetAt) : null
              }
              suffix=""
              tokenExtra={
                p.usageMode === "token"
                  ? {
                      cachedInput: p.rollingCacheInputTokensUsed,
                      output: p.rollingOutputTokensUsed,
                    }
                  : undefined
              }
            />
            <QuotaDetail
              label="Weekly"
              used={p.weekQuotaUsed}
              quota={p.weekQuota}
              resetAt={p.weekQuotaResetAt ? new Date(p.weekQuotaResetAt) : null}
              tokenExtra={
                p.usageMode === "token"
                  ? {
                      cachedInput: p.weekCacheInputTokensUsed,
                      output: p.weekOutputTokensUsed,
                    }
                  : undefined
              }
            />
            <QuotaDetail
              label="Monthly"
              used={p.monthQuotaUsed}
              quota={p.monthQuota}
              resetAt={
                p.monthQuotaResetAt ? new Date(p.monthQuotaResetAt) : null
              }
              tokenExtra={
                p.usageMode === "token"
                  ? {
                      cachedInput: p.monthCacheInputTokensUsed,
                      output: p.monthOutputTokensUsed,
                    }
                  : undefined
              }
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="ghost" size="xs" onClick={() => setEditRow(p)}>
            <Pencil className="h-3 w-3" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="text-destructive"
            onClick={() => handleDelete(p.id)}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </Button>
        </div>
      </div>
    ),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Providers</h1>
        <FormDialog
          title="New Provider"
          triggerLabel="+ New Provider"
          fields={PROVIDER_FIELDS}
          onSubmit={async (v) => {
            await apiFetch("/api/admin/providers", {
              method: "POST",
              body: JSON.stringify(v),
            });
            await load();
          }}
        />
      </div>

      <FormDialog
        title={`Edit Provider: ${editRow?.id ?? ""}`}
        fields={PROVIDER_FIELDS.filter((f) => f.name !== "id")}
        open={editRow != null}
        onOpenChange={(o) => {
          if (!o) setEditRow(null);
        }}
        initialValues={
          editRow
            ? {
                ...editRow,
                headersTemplate: editRow.headersTemplate
                  ? JSON.parse(editRow.headersTemplate)
                  : {},
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
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="text-muted-foreground text-sm">No providers yet.</div>
      ) : (
        <div className="space-y-2">
          {data.map((p) => {
            const isOpen = openId === p.id;
            return (
              <div
                key={p.id}
                className="rounded-lg border bg-card overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : p.id)}
                  className="flex w-full items-center px-4 py-3 text-left hover:bg-accent/30 transition-colors"
                >
                  <div className="mr-2 text-muted-foreground">
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </div>
                  {accordionItems.find((a) => a.id === p.id)?.header}
                </button>
                {isOpen && (
                  <div className="border-t px-4 py-4 bg-muted/10">
                    {accordionItems.find((a) => a.id === p.id)?.body}
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

function QuotaDetail({
  label,
  used,
  quota,
  resetAt,
  suffix,
  tokenExtra,
}: {
  label: string;
  used: number;
  quota: number | null;
  resetAt: Date | null;
  suffix?: string;
  tokenExtra?: { cachedInput: number; output: number };
}) {
  const totalUsed = tokenExtra
    ? used + tokenExtra.cachedInput + tokenExtra.output
    : used;
  const percent =
    quota != null && quota > 0
      ? Math.min(100, (totalUsed / quota) * 100)
      : null;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {quota != null && quota > 0
            ? `${formatQuotaNum(totalUsed)} / ${formatQuotaNum(quota)} (${percent?.toFixed(0) ?? 0}%)`
            : `${formatQuotaNum(totalUsed)} / ∞`}
          {suffix && <span className="text-muted-foreground/70">{suffix}</span>}
        </span>
      </div>
      {tokenExtra && (
        <div className="text-[10px] text-muted-foreground flex gap-2">
          <span>In: {formatQuotaNum(used)}</span>
          <span>Cache: {formatQuotaNum(tokenExtra.cachedInput)}</span>
          <span>Out: {formatQuotaNum(tokenExtra.output)}</span>
        </div>
      )}
      {percent != null && (
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      <div className="text-xs text-muted-foreground">
        下次重置: {formatNextReset(resetAt)}
      </div>
    </div>
  );
}
