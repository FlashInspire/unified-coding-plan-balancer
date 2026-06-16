"use client";

import { useEffect, useState, useMemo } from "react";
import { ModelList } from "./_components/model-list";
import { DataTable } from "../_components/data-table";
import { FormDialog } from "../_components/form-dialog";
import { ProviderModelEditDialog } from "./_components/provider-model-edit-dialog";
import { apiFetch } from "../_components/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Trash2, Power, Loader2 } from "lucide-react";
import type { ModelRow, ProviderModelRow, ProviderRow } from "@/lib/types";

/* ── Model form field definitions ──────────────────────────────────────── */

const MODEL_FORM_FIELDS = [
  { type: "section" as const, legend: "Basic" },
  {
    name: "id",
    label: "Model ID (slug)",
    type: "text" as const,
    required: true,
  },
  {
    name: "displayName",
    label: "Display Name",
    type: "text" as const,
    required: true,
  },
  { type: "section" as const, legend: "Model Configuration" },
  {
    name: "contextLength",
    label: "Context Length (K)",
    type: "number" as const,
    defaultValue: 128,
  },
  {
    name: "maxTokens",
    label: "Max Tokens (K)",
    type: "number" as const,
    defaultValue: 32,
  },
  { name: "temperature", label: "Temperature", type: "number" as const },
  { name: "topK", label: "Top K", type: "number" as const },
  { name: "topP", label: "Top P", type: "number" as const },
  {
    name: "reasoningEffort",
    label: "Reasoning Effort",
    type: "select" as const,
    options: ["low", "medium", "high"],
    defaultValue: "medium",
  },
  { name: "vision", label: "Vision", type: "boolean" as const },
  {
    name: "enableThinking",
    label: "Enable Thinking",
    type: "boolean" as const,
  },
  { name: "thinkingBudget", label: "Thinking Budget", type: "number" as const },
  { type: "section" as const, legend: "Harness Configuration" },
  {
    name: "includeReasoningInRequest",
    label: "Include reasoning",
    type: "boolean" as const,
  },
  { type: "section" as const, legend: "Extra Configuration" },
  {
    name: "frequencyPenalty",
    label: "Frequency Penalty",
    type: "number" as const,
  },
  {
    name: "presencePenalty",
    label: "Presence Penalty",
    type: "number" as const,
  },
  {
    name: "repetitionPenalty",
    label: "Repetition Penalty",
    type: "number" as const,
  },
];

/** Edit-mode fields: id is read-only. */
const MODEL_EDIT_FIELDS = MODEL_FORM_FIELDS.map((entry) => {
  if ("name" in entry && entry.name === "id") {
    return { ...entry, readOnly: true };
  }
  return entry;
});

/* ── Flat row type for the provider DataTable ─────────────────────────── */

interface ProviderTableRow {
  pmId: string | null;
  providerId: string;
  providerName: string;
  realModelId: string;
  weight: string;
  apiStyle: string;
  enabled: boolean;
  configured: boolean;
  quotaRunningOut: boolean;
  [key: string]: unknown;
}

/* ── Helper: ModelRow → initial values for edit form ──────────────────── */

function modelToInitialValues(m: ModelRow): Record<string, unknown> {
  // Tokens are stored in raw count; the form displays them in K (÷1024).
  return {
    id: m.id,
    displayName: m.displayName,
    contextLength: m.contextLength != null ? m.contextLength / 1024 : "",
    maxTokens: m.maxTokens != null ? m.maxTokens / 1024 : "",
    temperature: m.temperature ?? "",
    topK: m.topK ?? "",
    topP: m.topP ?? "",
    reasoningEffort: m.reasoningEffort ?? "medium",
    vision: m.vision,
    enableThinking: m.enableThinking ?? false,
    thinkingBudget: m.thinkingBudget ?? "",
    includeReasoningInRequest: m.includeReasoningInRequest,
    frequencyPenalty: m.frequencyPenalty ?? "",
    presencePenalty: m.presencePenalty ?? "",
    repetitionPenalty: m.repetitionPenalty ?? "",
  };
}

/**
 * Convert K-unit form values back to raw token counts before sending to the API.
 * Mutates a shallow copy so the caller's object is untouched.
 */
function expandKFields(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...values };
  for (const key of ["contextLength", "maxTokens"] as const) {
    const v = out[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      out[key] = Math.round(v * 1024);
    }
  }
  return out;
}

/* ── Component ────────────────────────────────────────────────────────── */

export default function ModelsPage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [pms, setPms] = useState<ProviderModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // In-flight spinners
  const [togglingPmId, setTogglingPmId] = useState<string | null>(null);
  const [enablingProviderId, setEnablingProviderId] = useState<string | null>(
    null,
  );

  // Model add/edit dialog
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [modelDialogInitial, setModelDialogInitial] = useState<
    Record<string, unknown> | undefined
  >(undefined);

  // ProviderModel edit dialog
  const [pmDialogOpen, setPmDialogOpen] = useState(false);
  const [pmDialogPm, setPmDialogPm] = useState<ProviderModelRow | null>(null);
  const [pmDialogProvider, setPmDialogProvider] = useState<ProviderRow | null>(
    null,
  );

  /* ── Data loading ──────────────────────────────────────────────────── */

  async function load() {
    setLoading(true);
    try {
      const [mRes, pRes, pmRes] = await Promise.all([
        apiFetch<{ data: ModelRow[] }>("/api/admin/models"),
        apiFetch<{ data: ProviderRow[] }>("/api/admin/providers"),
        apiFetch<{ data: ProviderModelRow[] }>("/api/admin/provider-models"),
      ]);
      setModels(mRes.data);
      setProviders(pRes.data);
      setPms(pmRes.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  /* ── Derived data ──────────────────────────────────────────────────── */

  const selectedModel = models.find((m) => m.id === selectedId) ?? null;

  const providerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const pm of pms) {
      counts[pm.modelId] = (counts[pm.modelId] ?? 0) + 1;
    }
    return counts;
  }, [pms]);

  const selectedPms = useMemo(() => {
    if (!selectedId) return [];
    return pms.filter((pm) => pm.modelId === selectedId);
  }, [pms, selectedId]);

  const pmMap = useMemo(() => {
    const map = new Map<string, ProviderModelRow>();
    for (const pm of selectedPms) {
      map.set(pm.providerId, pm);
    }
    return map;
  }, [selectedPms]);

  // Flat rows for the provider DataTable
  const providerTableData = useMemo<ProviderTableRow[]>(() => {
    if (!selectedModel) return [];
    return providers.map((prov) => {
      const pm = pmMap.get(prov.id);
      return {
        pmId: pm?.id ?? null,
        providerId: prov.id,
        providerName: prov.name,
        realModelId: pm?.realModelId ?? "—",
        weight: pm ? String(pm.weight) : "—",
        apiStyle: pm?.apiStyle ?? "—",
        enabled: pm?.enabled ?? false,
        configured: !!pm,
        quotaRunningOut: prov.quotaRunningOut,
      };
    });
  }, [providers, pmMap, selectedModel]);

  /* ── Handlers ──────────────────────────────────────────────────────── */

  async function handleToggleModelEnabled(m: ModelRow) {
    await apiFetch(`/api/admin/models/${m.id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !m.enabled }),
    });
    await load();
  }

  async function handleDeleteModel(m: ModelRow) {
    if (
      !confirm(
        `Delete model "${m.displayName}" (${m.id})?\n\nThis will cascade-delete all provider-model bindings for this model.`,
      )
    )
      return;
    await apiFetch(`/api/admin/models/${m.id}`, { method: "DELETE" });
    setSelectedId(null);
    await load();
  }

  function openEditModelDialog(m: ModelRow) {
    setModelDialogInitial(modelToInitialValues(m));
    setModelDialogOpen(true);
  }

  function openEditPmDialog(pm: ProviderModelRow, provider: ProviderRow) {
    setPmDialogPm(pm);
    setPmDialogProvider(provider);
    setPmDialogOpen(true);
  }

  async function handleQuickEnablePm(providerId: string) {
    if (!selectedId) return;
    setEnablingProviderId(providerId);
    try {
      await apiFetch("/api/admin/provider-models", {
        method: "POST",
        body: JSON.stringify({
          providerId,
          modelId: selectedId,
          enabled: true,
        }),
      });
      await load();
    } finally {
      setEnablingProviderId(null);
    }
  }

  async function handleTogglePm(row: ProviderTableRow) {
    if (!row.pmId) return;
    setTogglingPmId(row.pmId);
    try {
      await apiFetch(`/api/admin/provider-models/${row.pmId}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !row.enabled }),
      });
      await load();
    } finally {
      setTogglingPmId(null);
    }
  }

  async function handleRemovePm(row: ProviderTableRow) {
    if (!row.pmId) return;
    if (
      !confirm(
        `Remove ${selectedModel?.id ?? "model"} from ${row.providerName}?`,
      )
    )
      return;
    await apiFetch(`/api/admin/provider-models/${row.pmId}`, {
      method: "DELETE",
    });
    await load();
  }

  /* ── Provider DataTable columns ────────────────────────────────────── */

  const providerColumns = [
    {
      key: "providerName",
      label: "Provider",
      className: "w-[200px]",
      render: (row: ProviderTableRow) => (
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium">{row.providerName}</span>
          {row.quotaRunningOut && (
            <Badge
              variant="secondary"
              className="text-[10px] bg-amber-100 text-amber-800"
            >
              Low quota
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "realModelId",
      label: "Real Model ID",
      className: "w-[150px]",
      render: (row: ProviderTableRow) => (
        <span className="font-mono text-xs truncate block">
          {row.realModelId}
        </span>
      ),
    },
    {
      key: "weight",
      label: "Weight",
      className: "w-[60px]",
      render: (row: ProviderTableRow) => (
        <span className="text-xs">{row.weight}</span>
      ),
    },
    {
      key: "apiStyle",
      label: "API Style",
      className: "w-[90px]",
      render: (row: ProviderTableRow) => (
        <Badge variant="outline" className="text-[10px] font-mono">
          {row.apiStyle}
        </Badge>
      ),
    },
  ];

  /* ── Loading skeleton ──────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex gap-4 h-[calc(100vh-7rem)]">
        <div className="w-72 border rounded-lg p-3 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
        <div className="flex-1 space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  /* ── Render ────────────────────────────────────────────────────────── */

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)]">
      {/* ── Left panel: Model list ──────────────────────────────────── */}
      <div className="w-72 shrink-0 border rounded-lg overflow-hidden flex flex-col bg-card">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <h2 className="text-sm font-semibold">Models</h2>
          <FormDialog
            title="New Model"
            triggerLabel="+ New"
            fields={MODEL_FORM_FIELDS}
            onSubmit={async (v) => {
              await apiFetch("/api/admin/models", {
                method: "POST",
                body: JSON.stringify({ ...expandKFields(v), enabled: true }),
              });
              await load();
            }}
          />
        </div>
        <ModelList
          models={models}
          selectedId={selectedId}
          onSelect={setSelectedId}
          search={search}
          onSearchChange={setSearch}
          providerCounts={providerCounts}
        />
      </div>

      {/* ── Right panel: Detail view ────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {!selectedModel ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
            Select a model from the list to configure
          </div>
        ) : (
          <>
            {/* ── Header ────────────────────────────────────────────────── */}
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">
                  {selectedModel.displayName}
                </h2>
                <span className="text-xs text-muted-foreground font-mono">
                  {selectedModel.id}
                </span>

                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant={selectedModel.enabled ? "default" : "outline"}
                    size="sm"
                    onClick={() => void handleToggleModelEnabled(selectedModel)}
                  >
                    <Power className="h-3.5 w-3.5 mr-1" />
                    {selectedModel.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditModelDialog(selectedModel)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void handleDeleteModel(selectedModel)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>

            {/* ── Provider configurations table ─────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Provider Configurations
                </h3>
                <span className="text-xs text-muted-foreground">
                  {selectedPms.length} of {providers.length} providers
                  configured
                </span>
              </div>
              <div className="rounded-lg border bg-card overflow-hidden">
                <DataTable<ProviderTableRow>
                  columns={providerColumns}
                  data={[...providerTableData].sort((a, b) => {
                    const order = (r: ProviderTableRow) =>
                      r.configured && r.enabled ? 0 : r.configured ? 1 : 2;
                    return order(a) - order(b);
                  })}
                  idKey={"providerId" as keyof ProviderTableRow}
                  tableClassName="table-fixed"
                  rowClassName={(row) =>
                    !row.configured || !row.enabled ? "opacity-50" : undefined
                  }
                  actions={(row) =>
                    row.configured ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={togglingPmId === row.pmId}
                          onClick={() => void handleTogglePm(row)}
                        >
                          {togglingPmId === row.pmId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Power className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => {
                            const pm = pmMap.get(row.providerId);
                            const prov = providers.find(
                              (p) => p.id === row.providerId,
                            );
                            if (pm && prov) openEditPmDialog(pm, prov);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => void handleRemovePm(row)}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={enablingProviderId === row.providerId}
                        onClick={() => void handleQuickEnablePm(row.providerId)}
                      >
                        {enablingProviderId === row.providerId ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Power className="h-3 w-3 mr-1" />
                        )}
                        Enable
                      </Button>
                    )
                  }
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Model add / edit dialog (shared FormDialog) ──────────────── */}
      <FormDialog
        title={modelDialogInitial ? "Edit Model" : "New Model"}
        open={modelDialogOpen}
        onOpenChange={setModelDialogOpen}
        fields={modelDialogInitial ? MODEL_EDIT_FIELDS : MODEL_FORM_FIELDS}
        initialValues={modelDialogInitial}
        submitLabel={modelDialogInitial ? "Save" : "Create"}
        wide
        onSubmit={async (v) => {
          if (modelDialogInitial) {
            // Edit: omit id from the patch payload
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id: _id, ...rest } = v;
            const patch = expandKFields(rest);
            await apiFetch(`/api/admin/models/${selectedId}`, {
              method: "PATCH",
              body: JSON.stringify(patch),
            });
          } else {
            await apiFetch("/api/admin/models", {
              method: "POST",
              body: JSON.stringify({ ...expandKFields(v), enabled: true }),
            });
          }
          await load();
        }}
      />

      {/* ── ProviderModel edit dialog ───────────────────────────────── */}
      {selectedModel && pmDialogProvider && (
        <ProviderModelEditDialog
          open={pmDialogOpen}
          onOpenChange={setPmDialogOpen}
          pm={pmDialogPm}
          provider={pmDialogProvider}
          model={selectedModel}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}
