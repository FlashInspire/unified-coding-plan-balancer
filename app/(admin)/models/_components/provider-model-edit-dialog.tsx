"use client";

import { FormDialog } from "../../_components/form-dialog";
import { apiFetch } from "../../_components/api";
import type { ModelRow, ProviderModelRow, ProviderRow } from "@/lib/types";

interface ProviderModelEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pm: ProviderModelRow | null;
  provider: ProviderRow;
  model: ModelRow;
  onSaved: () => void;
}

export function ProviderModelEditDialog({
  open,
  onOpenChange,
  pm,
  provider,
  model,
  onSaved,
}: ProviderModelEditDialogProps) {
  const isEdit = pm !== null;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Edit — ${provider.name}` : `Enable — ${provider.name}`}
      submitLabel={isEdit ? "Save" : "Create"}
      wide
      fields={[
        { type: "section", legend: "Binding" },
        {
          name: "realModelId",
          label: "Real Model ID",
          type: "text",
          placeholder: model.id,
        },
        {
          name: "weight",
          label: "Weight",
          type: "number",
          defaultValue: 1,
        },
        {
          name: "apiStyle",
          label: "API Style",
          type: "select",
          options: ["auto", "openai", "anthropic"],
          defaultValue: "auto",
        },
        { type: "section", legend: "Overrides" },
        {
          name: "maxTokensOverride",
          label: "Max Tokens Override (K)",
          type: "number",
          placeholder: String(model.maxTokens / 1024),
        },
        {
          name: "temperatureOverride",
          label: "Temperature Override",
          type: "number",
          placeholder:
            model.temperature != null ? String(model.temperature) : "",
        },
        { type: "section", legend: "Fee Rates" },
        {
          name: "feeRateInput",
          label: "Fee Rate Input",
          type: "number",
          defaultValue: 1,
        },
        {
          name: "feeRateCachedInput",
          label: "Fee Rate Cached Input",
          type: "number",
          defaultValue: 0.5,
        },
        {
          name: "feeRateOutput",
          label: "Fee Rate Output",
          type: "number",
          defaultValue: 1,
        },
        { type: "section", legend: "Status" },
        {
          name: "enabled",
          label: "Enabled",
          type: "boolean",
          defaultValue: true,
        },
      ]}
      initialValues={
        pm
          ? {
              realModelId: pm.realModelId ?? "",
              weight: pm.weight,
              apiStyle: pm.apiStyle,
              // Display in K (÷1024); see onSubmit for ×1024 reverse.
              maxTokensOverride:
                pm.maxTokensOverride != null ? pm.maxTokensOverride / 1024 : "",
              temperatureOverride: pm.temperatureOverride ?? "",
              feeRateInput: pm.feeRateInput,
              feeRateCachedInput: pm.feeRateCachedInput,
              feeRateOutput: pm.feeRateOutput,
              enabled: pm.enabled,
            }
          : {
              realModelId: "",
              weight: 1,
              apiStyle: "auto",
              feeRateInput: 1,
              feeRateCachedInput: 0.5,
              feeRateOutput: 1,
              enabled: true,
            }
      }
      onSubmit={async (values) => {
        const body: Record<string, unknown> = {
          ...values,
          providerId: provider.id,
          modelId: model.id,
        };
        // Normalize empty strings to null for optional overrides
        if (body.maxTokensOverride === "") body.maxTokensOverride = null;
        if (body.temperatureOverride === "") body.temperatureOverride = null;
        if (body.realModelId === "") body.realModelId = null;
        // Convert K-unit input back to raw token count.
        if (
          typeof body.maxTokensOverride === "number" &&
          Number.isFinite(body.maxTokensOverride)
        ) {
          body.maxTokensOverride = Math.round(body.maxTokensOverride * 1024);
        }

        if (isEdit) {
          await apiFetch(`/api/admin/provider-models/${pm.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
        } else {
          await apiFetch("/api/admin/provider-models", {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        onSaved();
      }}
    />
  );
}
