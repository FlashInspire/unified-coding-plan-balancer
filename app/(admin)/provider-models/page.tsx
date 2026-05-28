"use client";

import { useEffect, useMemo, useState } from "react";
import { Accordion } from "../_components/accordion";
import { DataTable } from "../_components/data-table";
import { FormDialog, type SelectOption } from "../_components/form-dialog";
import { apiFetch } from "../_components/api";
import type { ProviderModelRow, ProviderRow, ModelRow } from "@/lib/types";

const PM_FIELDS_BASE = [
  {
    name: "providerId",
    label: "Provider",
    type: "select" as const,
    required: true,
  },
  {
    name: "modelId",
    label: "Model",
    type: "select" as const,
    required: true,
  },
  {
    name: "realModelId",
    label: "Upstream Real Model ID",
    type: "text" as const,
    required: true,
  },
  {
    name: "maxTokensOverride",
    label: "Max Tokens Override",
    type: "number" as const,
  },
  {
    name: "temperatureOverride",
    label: "Temperature Override",
    type: "number" as const,
  },
  {
    name: "weight",
    label: "Weight",
    type: "number" as const,
    defaultValue: 1,
  },
  {
    name: "feeRateInput",
    label: "Fee Rate (Input)",
    type: "number" as const,
    defaultValue: 1,
  },
  {
    name: "feeRateCachedInput",
    label: "Fee Rate (Cached Input)",
    type: "number" as const,
    defaultValue: 0.1,
  },
  {
    name: "feeRateOutput",
    label: "Fee Rate (Output)",
    type: "number" as const,
    defaultValue: 4,
  },
  {
    name: "enabled",
    label: "Enabled",
    type: "boolean" as const,
    defaultValue: true,
  },
];

/** Return fee rate fields appropriate for the provider's usageMode. */
function feeRateFieldsForMode(usageMode?: string) {
  const tokenOnly = ["feeRateCachedInput", "feeRateOutput"];
  if (usageMode === "token") {
    // Token mode: show all three rates, relabel feeRateInput
    return PM_FIELDS_BASE.map((f) =>
      f.name === "feeRateInput" ? { ...f, label: "Fee Rate (Input Token)" } : f,
    );
  }
  // Request mode: hide cached input & output rates
  return PM_FIELDS_BASE.filter((f) => !tokenOnly.includes(f.name)).map((f) =>
    f.name === "feeRateInput" ? { ...f, label: "Fee Rate (per Request)" } : f,
  );
}

/** Return DataTable columns for fee rates based on provider usageMode. */
function feeRateColumnsForMode(usageMode?: string) {
  if (usageMode === "token") {
    return [
      { key: "feeRateInput", label: "Rate In" },
      { key: "feeRateCachedInput", label: "Rate Cache" },
      { key: "feeRateOutput", label: "Rate Out" },
    ];
  }
  return [{ key: "feeRateInput", label: "Rate" }];
}

export default function ProviderModelsPage() {
  const [data, setData] = useState<ProviderModelRow[]>([]);
  const [providers, setProviders] = useState<SelectOption[]>([]);
  const [providersRaw, setProvidersRaw] = useState<ProviderRow[]>([]);
  const [models, setModels] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState<ProviderModelRow | null>(null);
  const [addForProvider, setAddForProvider] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [pmRes, provRes, modRes] = await Promise.all([
        apiFetch<{ data: ProviderModelRow[] }>("/api/admin/provider-models"),
        apiFetch<{ data: ProviderRow[] }>("/api/admin/providers"),
        apiFetch<{ data: ModelRow[] }>("/api/admin/models"),
      ]);
      setData(pmRes.data);
      setProvidersRaw(provRes.data);
      setProviders(
        provRes.data.map((p) => ({
          value: p.id,
          label: `${p.name} (${p.id})`,
        })),
      );
      setModels(
        modRes.data.map((m) => ({
          value: m.id,
          label: `${m.displayName} (${m.id})`,
        })),
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  // Group provider-models by providerId
  const grouped = useMemo(() => {
    const map = new Map<string, ProviderModelRow[]>();
    for (const pm of data) {
      const arr = map.get(pm.providerId) ?? [];
      arr.push(pm);
      map.set(pm.providerId, arr);
    }
    return map;
  }, [data]);

  // Build accordion items: one per provider that has models
  const accordionItems = useMemo(() => {
    // Show all providers (even those with 0 models)
    return providersRaw.map((prov) => {
      const pms = grouped.get(prov.id) ?? [];
      return {
        id: prov.id,
        header: (
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${
                prov.enabled ? "bg-green-500" : "bg-gray-400"
              }`}
            />
            <div className="min-w-0">
              <span className="font-semibold text-sm">{prov.name}</span>
              <span className="text-muted-foreground text-xs ml-2">
                {prov.id}
              </span>
              {prov.quotaRunningOut && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 ml-2">
                  Running out
                </span>
              )}
            </div>
            <span className="ml-auto text-xs text-muted-foreground shrink-0">
              {pms.length} model{pms.length !== 1 ? "s" : ""}
            </span>
          </div>
        ),
        body: (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                onClick={() => setAddForProvider(prov.id)}
              >
                + Add Model
              </button>
            </div>
            {pms.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                No models configured for this provider.
              </div>
            ) : (
              <DataTable
                idKey="id"
                data={pms as unknown as Record<string, unknown>[]}
                columns={[
                  { key: "modelId", label: "Model" },
                  { key: "realModelId", label: "Real Model" },
                  { key: "weight", label: "W" },
                  ...feeRateColumnsForMode(prov.usageMode),
                  {
                    key: "enabled",
                    label: "Enabled",
                    render: (r) => (r.enabled ? "✓" : "✗"),
                  },
                ]}
                onDelete={async (id) => {
                  await apiFetch(`/api/admin/provider-models/${id}`, {
                    method: "DELETE",
                  });
                  await load();
                }}
                actions={(r) => (
                  <>
                    <button
                      className="text-xs hover:underline"
                      onClick={() =>
                        setEditRow(r as unknown as ProviderModelRow)
                      }
                    >
                      Edit
                    </button>
                    <button
                      className="text-xs hover:underline ml-2"
                      onClick={async () => {
                        await apiFetch(`/api/admin/provider-models/${r.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ enabled: !r.enabled }),
                        });
                        await load();
                      }}
                    >
                      {r.enabled ? "Disable" : "Enable"}
                    </button>
                  </>
                )}
              />
            )}
          </div>
        ),
      };
    });
  }, [providersRaw, grouped]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Provider × Models</h1>
        <FormDialog
          title="New Provider-Model"
          triggerLabel="+ New"
          fields={feeRateFieldsForMode(undefined).map((f) =>
            f.name === "providerId"
              ? { ...f, options: providers }
              : f.name === "modelId"
                ? { ...f, options: models }
                : f,
          )}
          onSubmit={async (v) => {
            await apiFetch("/api/admin/provider-models", {
              method: "POST",
              body: JSON.stringify(v),
            });
            await load();
          }}
        />
      </div>

      {/* Edit dialog */}
      <FormDialog
        title={`Edit: ${editRow?.providerId ?? ""} / ${editRow?.modelId ?? ""}`}
        fields={feeRateFieldsForMode(
          providersRaw.find((p) => p.id === editRow?.providerId)?.usageMode,
        ).filter((f) => f.name !== "providerId" && f.name !== "modelId")}
        open={editRow != null}
        onOpenChange={(o) => {
          if (!o) setEditRow(null);
        }}
        initialValues={
          editRow ? (editRow as unknown as Record<string, unknown>) : undefined
        }
        submitLabel="Update"
        onSubmit={async (v) => {
          await apiFetch(`/api/admin/provider-models/${editRow!.id}`, {
            method: "PATCH",
            body: JSON.stringify(v),
          });
          setEditRow(null);
          await load();
        }}
      />

      {/* Add model to specific provider shortcut */}
      <FormDialog
        title={`Add Model to ${addForProvider ?? ""}`}
        fields={feeRateFieldsForMode(
          providersRaw.find((p) => p.id === addForProvider)?.usageMode,
        ).map((f) =>
          f.name === "providerId"
            ? { ...f, options: providers }
            : f.name === "modelId"
              ? { ...f, options: models }
              : f,
        )}
        open={addForProvider != null}
        onOpenChange={(o) => {
          if (!o) setAddForProvider(null);
        }}
        initialValues={
          addForProvider ? { providerId: addForProvider } : undefined
        }
        submitLabel="Create"
        onSubmit={async (v) => {
          await apiFetch("/api/admin/provider-models", {
            method: "POST",
            body: JSON.stringify(v),
          });
          setAddForProvider(null);
          await load();
        }}
      />

      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <Accordion items={accordionItems} />
      )}
    </div>
  );
}
