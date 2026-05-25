"use client";

import { useEffect, useState } from "react";
import { Cron } from "croner";
import { Accordion } from "../_components/accordion";
import { FormDialog } from "../_components/form-dialog";
import { apiFetch } from "../_components/api";
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
    name: "monthQuota",
    label: "Month Quota",
    type: "number" as const,
  },
  {
    name: "enabled",
    label: "Enabled",
    type: "boolean" as const,
    defaultValue: true,
  },
];

function formatQuotaCompact(used: number, quota: number | null): string {
  if (quota == null) return `${used.toFixed(0)}/∞`;
  return `${used.toFixed(0)}/${quota}`;
}

function getNextCronFire(cronExpr: string | null): Date | null {
  if (!cronExpr) return null;
  try {
    const job = new Cron(cronExpr);
    const next = job.nextRun();
    return next;
  } catch {
    return null;
  }
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "即将";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m 后`;
  if (m > 0) return `${m}m 后`;
  return "<1m 后";
}

function formatNextReset(next: Date | null): string {
  if (!next) return "—";
  const diff = next.getTime() - Date.now();
  if (diff < 24 * 60 * 60_000) {
    return formatDuration(diff);
  }
  return next.toLocaleString();
}

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

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
    if (!confirm("Delete this provider?")) return;
    await apiFetch(`/api/admin/providers/${id}`, { method: "DELETE" });
    await load();
  }

  const accordionItems = data.map((p) => ({
    id: p.id,
    header: (
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${
            p.enabled ? "bg-green-500" : "bg-gray-400"
          }`}
          title={p.enabled ? "Enabled" : "Disabled"}
        />
        <div className="min-w-0">
          <span className="font-semibold text-sm">{p.name}</span>
          <span className="text-muted-foreground text-xs ml-2">{p.id}</span>
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
            Quota
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <QuotaDetail
              label="Rolling"
              used={p.rollingQuotaUsed}
              quota={p.rollingQuota}
              cronExpr={p.rollingQuotaCron}
              nextReset={formatNextReset(getNextCronFire(p.rollingQuotaCron))}
            />
            <QuotaDetail
              label="Weekly"
              used={p.weekQuotaUsed}
              quota={p.weekQuota}
              cronExpr={p.weekQuotaCron}
              nextReset={formatNextReset(getNextCronFire(p.weekQuotaCron))}
            />
            <QuotaDetail
              label="Monthly"
              used={p.monthQuotaUsed}
              quota={p.monthQuota}
              cronExpr={p.monthQuotaCron}
              nextReset={formatNextReset(getNextCronFire(p.monthQuotaCron))}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            className="text-xs hover:underline"
            onClick={() => setEditRow(p)}
          >
            Edit
          </button>
          <button
            className="text-xs hover:underline text-destructive"
            onClick={() => handleDelete(p.id)}
          >
            Delete
          </button>
        </div>
      </div>
    ),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Providers</h1>
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
        <div className="text-muted-foreground">Loading...</div>
      ) : data.length === 0 ? (
        <div className="text-muted-foreground">No providers yet.</div>
      ) : (
        <Accordion items={accordionItems} />
      )}
    </div>
  );
}

function QuotaDetail({
  label,
  used,
  quota,
  cronExpr,
  nextReset,
}: {
  label: string;
  used: number;
  quota: number | null;
  cronExpr: string | null;
  nextReset: string;
}) {
  const percent =
    quota != null && quota > 0 ? Math.min(100, (used / quota) * 100) : null;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {quota != null
            ? `${used.toFixed(0)} / ${quota}`
            : `${used.toFixed(0)} / ∞`}
        </span>
      </div>
      {percent != null && (
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {cronExpr && (
        <div className="text-xs font-mono text-muted-foreground/70">
          {cronExpr}
        </div>
      )}
      <div className="text-xs text-muted-foreground">下次重置: {nextReset}</div>
    </div>
  );
}
