"use client";

import { useEffect, useState, useMemo } from "react";
import { ModelList } from "./_components/model-list";
import { ProviderConfigCard } from "./_components/provider-config-card";
import { FormDialog } from "../_components/form-dialog";
import { apiFetch } from "../_components/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Loader2 } from "lucide-react";
import type { ModelRow, ProviderModelRow, ProviderRow } from "@/lib/types";

const MODEL_FIELDS = [
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
  {
    name: "contextLength",
    label: "Context Length",
    type: "number" as const,
    required: true,
    defaultValue: 131072,
  },
  {
    name: "maxTokens",
    label: "Max Tokens",
    type: "number" as const,
    required: true,
    defaultValue: 32768,
  },
  { name: "temperature", label: "Temperature", type: "number" as const },
  { name: "topP", label: "Top P", type: "number" as const },
  { name: "topK", label: "Top K", type: "number" as const, defaultValue: 1 },
  { name: "minP", label: "Min P", type: "number" as const },
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
  {
    name: "reasoningEffort",
    label: "Reasoning Effort",
    type: "select" as const,
    options: ["low", "medium", "high"],
    defaultValue: "medium",
  },
  {
    name: "includeReasoningInRequest",
    label: "Include reasoning",
    type: "boolean" as const,
  },
  { name: "vision", label: "Vision", type: "boolean" as const },
  {
    name: "enableThinking",
    label: "Enable Thinking",
    type: "boolean" as const,
  },
  { name: "thinkingBudget", label: "Thinking Budget", type: "number" as const },
  {
    name: "enabled",
    label: "Enabled",
    type: "boolean" as const,
    defaultValue: true,
  },
];

export default function ModelsPage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [pms, setPms] = useState<ProviderModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modelEditValues, setModelEditValues] = useState<
    Record<string, unknown>
  >({});
  const [savingModel, setSavingModel] = useState(false);

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

  const selectedModel = models.find((m) => m.id === selectedId) ?? null;

  // Build provider count per model
  const providerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const pm of pms) {
      counts[pm.modelId] = (counts[pm.modelId] ?? 0) + 1;
    }
    return counts;
  }, [pms]);

  // Get PMs for selected model
  const selectedPms = useMemo(() => {
    if (!selectedId) return [];
    return pms.filter((pm) => pm.modelId === selectedId);
  }, [pms, selectedId]);

  // Map providerId -> PM for selected model
  const pmMap = useMemo(() => {
    const map = new Map<string, ProviderModelRow>();
    for (const pm of selectedPms) {
      map.set(pm.providerId, pm);
    }
    return map;
  }, [selectedPms]);

  async function handleSaveModel() {
    if (!selectedId || Object.keys(modelEditValues).length === 0) return;
    setSavingModel(true);
    try {
      await apiFetch(`/api/admin/models/${selectedId}`, {
        method: "PATCH",
        body: JSON.stringify(modelEditValues),
      });
      setModelEditValues({});
      await load();
    } finally {
      setSavingModel(false);
    }
  }

  function updateModelField(field: string, value: unknown) {
    setModelEditValues((v) => ({ ...v, [field]: value }));
  }

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

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)]">
      {/* Left panel: Model list */}
      <div className="w-72 shrink-0 border rounded-lg overflow-hidden flex flex-col bg-card">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <h2 className="text-sm font-semibold">Models</h2>
          <FormDialog
            title="New Model"
            triggerLabel="+ New"
            fields={MODEL_FIELDS}
            onSubmit={async (v) => {
              await apiFetch("/api/admin/models", {
                method: "POST",
                body: JSON.stringify(v),
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

      {/* Right panel: Detail view */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {!selectedModel ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Select a model from the list to configure
          </div>
        ) : (
          <>
            {/* Model details */}
            <div className="rounded-lg border bg-card p-4 space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">
                  {selectedModel.displayName}
                </h2>
                <span className="text-xs text-muted-foreground font-mono">
                  {selectedModel.id}
                </span>
                <Badge
                  variant={selectedModel.enabled ? "default" : "secondary"}
                  className="text-[10px]"
                >
                  {selectedModel.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground block mb-0.5">
                    Context Length
                  </label>
                  <Input
                    type="number"
                    defaultValue={selectedModel.contextLength}
                    onChange={(e) =>
                      updateModelField("contextLength", Number(e.target.value))
                    }
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground block mb-0.5">
                    Max Tokens
                  </label>
                  <Input
                    type="number"
                    defaultValue={selectedModel.maxTokens}
                    onChange={(e) =>
                      updateModelField("maxTokens", Number(e.target.value))
                    }
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground block mb-0.5">
                    Temperature
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    defaultValue={selectedModel.temperature ?? ""}
                    onChange={(e) =>
                      updateModelField(
                        "temperature",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground block mb-0.5">
                    Top P
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    defaultValue={selectedModel.topP ?? ""}
                    onChange={(e) =>
                      updateModelField(
                        "topP",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground block mb-0.5">
                    Reasoning Effort
                  </label>
                  <select
                    defaultValue={selectedModel.reasoningEffort ?? ""}
                    onChange={(e) =>
                      updateModelField(
                        "reasoningEffort",
                        e.target.value || null,
                      )
                    }
                    className="h-7 w-full rounded-lg border border-input bg-background px-2 text-xs"
                  >
                    <option value="">--</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="flex items-center gap-4 col-span-2 lg:col-span-3">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      defaultChecked={selectedModel.vision}
                      onChange={(e) =>
                        updateModelField("vision", e.target.checked)
                      }
                      className="h-3.5 w-3.5"
                    />
                    Vision
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      defaultChecked={selectedModel.enableThinking ?? false}
                      onChange={(e) =>
                        updateModelField("enableThinking", e.target.checked)
                      }
                      className="h-3.5 w-3.5"
                    />
                    Thinking
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      defaultChecked={selectedModel.enabled}
                      onChange={(e) =>
                        updateModelField("enabled", e.target.checked)
                      }
                      className="h-3.5 w-3.5"
                    />
                    Enabled
                  </label>
                </div>
              </div>
              {Object.keys(modelEditValues).length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveModel}
                    disabled={savingModel}
                  >
                    {savingModel ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    Save Model
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setModelEditValues({})}
                  >
                    Discard
                  </Button>
                </div>
              )}
            </div>

            {/* Provider configurations */}
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
              <div className="space-y-2">
                {providers.map((prov) => (
                  <ProviderConfigCard
                    key={prov.id}
                    provider={prov}
                    pm={pmMap.get(prov.id)}
                    model={selectedModel}
                    onUpdate={load}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
