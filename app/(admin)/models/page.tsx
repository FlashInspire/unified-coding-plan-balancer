"use client";

import { useEffect, useState } from "react";
import { DataTable } from "../_components/data-table";
import { FormDialog } from "../_components/form-dialog";
import { apiFetch } from "../_components/api";
import type { ModelRow } from "@/lib/types";

const MODEL_FIELDS = [
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
  },
  {
    name: "maxTokens",
    label: "Max Tokens",
    type: "number" as const,
    required: true,
  },
  { name: "temperature", label: "Temperature", type: "number" as const },
  { name: "topP", label: "Top P", type: "number" as const },
  { name: "topK", label: "Top K", type: "number" as const },
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
  },
  {
    name: "includeReasoningInRequest",
    label: "Include reasoning in request",
    type: "boolean" as const,
  },
  {
    name: "vision",
    label: "Vision",
    type: "boolean" as const,
  },
  {
    name: "enableThinking",
    label: "Enable Thinking",
    type: "boolean" as const,
  },
  { name: "thinkingBudget", label: "Thinking Budget", type: "number" as const },
  { name: "enabled", label: "Enabled", type: "boolean" as const },
];

/** Format token counts using binary units (1K = 1024, 1M = 1024²). */
function formatTokensBin(n: number): string {
  if (n >= 1_048_576) {
    const m = n / 1_048_576;
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1024) {
    const k = n / 1024;
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1).replace(/\.0$/, "")}K`;
  }
  return String(n);
}

export default function ModelsPage() {
  const [data, setData] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState<ModelRow | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await apiFetch<{ data: ModelRow[] }>("/api/admin/models");
      setData(r.data);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Models</h1>
        <FormDialog
          title="New Model"
          triggerLabel="+ New Model"
          fields={[
            {
              name: "id",
              label: "Model ID (slug)",
              type: "text",
              required: true,
            },
            {
              name: "displayName",
              label: "Display Name",
              type: "text",
              required: true,
            },
            {
              name: "contextLength",
              label: "Context Length",
              type: "number",
              required: true,
              defaultValue: 131072,
            },
            {
              name: "maxTokens",
              label: "Max Tokens",
              type: "number",
              required: true,
              defaultValue: 32768,
            },
            { name: "temperature", label: "Temperature", type: "number" },
            { name: "topP", label: "Top P", type: "number" },
            { name: "topK", label: "Top K", type: "number", defaultValue: 1 },
            { name: "minP", label: "Min P", type: "number" },
            {
              name: "frequencyPenalty",
              label: "Frequency Penalty",
              type: "number",
            },
            {
              name: "presencePenalty",
              label: "Presence Penalty",
              type: "number",
            },
            {
              name: "repetitionPenalty",
              label: "Repetition Penalty",
              type: "number",
            },
            {
              name: "reasoningEffort",
              label: "Reasoning Effort",
              type: "select",
              options: ["low", "medium", "high"],
              defaultValue: "medium",
            },
            {
              name: "includeReasoningInRequest",
              label: "Include reasoning in request",
              type: "boolean",
            },
            {
              name: "vision",
              label: "Vision",
              type: "boolean",
            },
            {
              name: "enableThinking",
              label: "Enable Thinking",
              type: "boolean",
            },
            {
              name: "thinkingBudget",
              label: "Thinking Budget",
              type: "number",
            },
            {
              name: "enabled",
              label: "Enabled",
              type: "boolean",
              defaultValue: true,
            },
          ]}
          onSubmit={async (v) => {
            await apiFetch("/api/admin/models", {
              method: "POST",
              body: JSON.stringify(v),
            });
            await load();
          }}
        />
      </div>
      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <DataTable
          idKey="id"
          data={data as unknown as Record<string, unknown>[]}
          columns={[
            { key: "id", label: "ID" },
            { key: "displayName", label: "Name" },
            {
              key: "contextLength",
              label: "Ctx",
              render: (r) => formatTokensBin(Number(r.contextLength)),
            },
            {
              key: "maxTokens",
              label: "MaxTok",
              render: (r) => formatTokensBin(Number(r.maxTokens)),
            },
            {
              key: "enabled",
              label: "Enabled",
              render: (r) => (r.enabled ? "✓" : "✗"),
            },
          ]}
          actions={(row) => (
            <button
              className="text-xs hover:underline"
              onClick={() => setEditRow(row as unknown as ModelRow)}
            >
              Edit
            </button>
          )}
          onDelete={async (id) => {
            await apiFetch(`/api/admin/models/${id}`, { method: "DELETE" });
            await load();
          }}
        />
      )}

      {editRow && (
        <FormDialog
          title={`Edit Model: ${editRow.id}`}
          fields={MODEL_FIELDS}
          initialValues={editRow as unknown as Record<string, unknown>}
          open={true}
          onOpenChange={(o) => {
            if (!o) setEditRow(null);
          }}
          onSubmit={async (v) => {
            await apiFetch(`/api/admin/models/${editRow.id}`, {
              method: "PATCH",
              body: JSON.stringify(v),
            });
            setEditRow(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
