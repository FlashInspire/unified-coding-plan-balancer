"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Save, Loader2, Power } from "lucide-react";
import { apiFetch } from "../../_components/api";
import type { ProviderModelRow, ProviderRow, ModelRow } from "@/lib/types";

interface ProviderConfigCardProps {
  provider: ProviderRow;
  pm: ProviderModelRow | undefined;
  model: ModelRow;
  onUpdate: () => void;
}

export function ProviderConfigCard({
  provider,
  pm,
  model,
  onUpdate,
}: ProviderConfigCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [toggling, startToggle] = useTransition();
  const [saving, startSave] = useTransition();
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});

  const isConfigured = !!pm;

  async function handleToggle() {
    if (!isConfigured) {
      // Create PM with defaults
      startToggle(async () => {
        await apiFetch("/api/admin/provider-models", {
          method: "POST",
          body: JSON.stringify({
            providerId: provider.id,
            modelId: model.id,
            enabled: true,
          }),
        });
        onUpdate();
      });
    } else {
      // Toggle enabled/disabled
      startToggle(async () => {
        await apiFetch(`/api/admin/provider-models/${pm!.id}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: !pm!.enabled }),
        });
        onUpdate();
      });
    }
  }

  async function handleSave() {
    if (!pm) return;
    startSave(async () => {
      await apiFetch(`/api/admin/provider-models/${pm.id}`, {
        method: "PATCH",
        body: JSON.stringify(editValues),
      });
      setEditValues({});
      onUpdate();
    });
  }

  async function handleDelete() {
    if (!pm) return;
    if (!confirm(`Remove ${model.id} from ${provider.name}?`)) return;
    await apiFetch(`/api/admin/provider-models/${pm.id}`, {
      method: "DELETE",
    });
    onUpdate();
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          onClick={() => isConfigured && setExpanded(!expanded)}
          className="text-muted-foreground"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <span className="text-xs font-medium flex-1 truncate">
          {provider.name}
        </span>
        <span className="text-xs text-muted-foreground font-mono">
          {provider.id}
        </span>
        {provider.quotaRunningOut && (
          <Badge
            variant="secondary"
            className="text-[10px] bg-amber-100 text-amber-800"
          >
            Low quota
          </Badge>
        )}
        <Button
          variant={isConfigured && pm?.enabled ? "default" : "outline"}
          size="xs"
          onClick={handleToggle}
          disabled={toggling}
        >
          {toggling ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Power className="h-3 w-3" />
          )}
          {isConfigured ? (pm?.enabled ? "On" : "Off") : "Enable"}
        </Button>
      </div>

      {expanded && isConfigured && pm && (
        <div className="border-t bg-muted/20 px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground block mb-0.5">
                Real Model ID
              </label>
              <Input
                defaultValue={pm.realModelId ?? ""}
                onChange={(e) =>
                  setEditValues((v) => ({
                    ...v,
                    realModelId: e.target.value || null,
                  }))
                }
                className="h-7 text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground block mb-0.5">
                Weight
              </label>
              <Input
                type="number"
                defaultValue={String(pm.weight)}
                onChange={(e) =>
                  setEditValues((v) => ({
                    ...v,
                    weight: Number(e.target.value),
                  }))
                }
                className="h-7 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground block mb-0.5">
                API Style
              </label>
              <select
                defaultValue={pm.apiStyle}
                onChange={(e) =>
                  setEditValues((v) => ({ ...v, apiStyle: e.target.value }))
                }
                className="h-7 w-full rounded-lg border border-input bg-background px-2 text-xs"
              >
                <option value="auto">Auto</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground block mb-0.5">
                Fee Rate Input
              </label>
              <Input
                type="number"
                step="0.1"
                defaultValue={String(pm.feeRateInput)}
                onChange={(e) =>
                  setEditValues((v) => ({
                    ...v,
                    feeRateInput: Number(e.target.value),
                  }))
                }
                className="h-7 text-xs"
              />
            </div>
            {provider.usageMode === "token" && (
              <>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground block mb-0.5">
                    Fee Rate Cached
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    defaultValue={String(pm.feeRateCachedInput)}
                    onChange={(e) =>
                      setEditValues((v) => ({
                        ...v,
                        feeRateCachedInput: Number(e.target.value),
                      }))
                    }
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground block mb-0.5">
                    Fee Rate Output
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    defaultValue={String(pm.feeRateOutput)}
                    onChange={(e) =>
                      setEditValues((v) => ({
                        ...v,
                        feeRateOutput: Number(e.target.value),
                      }))
                    }
                    className="h-7 text-xs"
                  />
                </div>
              </>
            )}
            <div>
              <label className="text-[10px] font-medium text-muted-foreground block mb-0.5">
                Max Tokens Override
              </label>
              <Input
                type="number"
                defaultValue={
                  pm.maxTokensOverride != null
                    ? String(pm.maxTokensOverride)
                    : ""
                }
                placeholder={`${model.maxTokens}`}
                onChange={(e) =>
                  setEditValues((v) => ({
                    ...v,
                    maxTokensOverride: e.target.value
                      ? Number(e.target.value)
                      : null,
                  }))
                }
                className="h-7 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground block mb-0.5">
                Temperature Override
              </label>
              <Input
                type="number"
                step="0.1"
                defaultValue={
                  pm.temperatureOverride != null
                    ? String(pm.temperatureOverride)
                    : ""
                }
                placeholder={`${model.temperature ?? ""}`}
                onChange={(e) =>
                  setEditValues((v) => ({
                    ...v,
                    temperatureOverride: e.target.value
                      ? Number(e.target.value)
                      : null,
                  }))
                }
                className="h-7 text-xs"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {Object.keys(editValues).length > 0 && (
              <Button size="xs" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                Save Changes
              </Button>
            )}
            <Button
              variant="ghost"
              size="xs"
              onClick={handleDelete}
              className="text-destructive"
            >
              Remove
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
