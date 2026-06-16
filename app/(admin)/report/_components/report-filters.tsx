"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GripVertical, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type Granularity = "hour" | "day" | "week" | "month";
export type GroupByLevel = "period" | "model" | "provider" | "apiKey";

const GROUP_LABELS: Record<GroupByLevel, string> = {
  period: "Period",
  model: "Model",
  provider: "Provider",
  apiKey: "API Key",
};

export interface ReportFilters {
  granularity: Granularity;
  modelId: string;
  providerId: string;
  apiKeyId: string;
  from: string; // ISO date string "YYYY-MM-DD"
  to: string; // ISO date string "YYYY-MM-DD"
  groupBy: GroupByLevel[];
}

interface ReportFiltersBarProps {
  filters: ReportFilters;
  onChange: (filters: ReportFilters) => void;
  onRefresh: () => void;
  loading?: boolean;
  modelOptions: { id: string; name: string }[];
  providerOptions: { id: string; name: string }[];
  apiKeyOptions: { id: string; name: string }[];
  isAdmin: boolean;
}

export function ReportFiltersBar({
  filters,
  onChange,
  onRefresh,
  loading,
  modelOptions,
  providerOptions,
  apiKeyOptions,
  isAdmin,
}: ReportFiltersBarProps) {
  function update<K extends keyof ReportFilters>(
    key: K,
    value: ReportFilters[K],
  ) {
    onChange({ ...filters, [key]: value });
  }

  const hasFilters =
    filters.modelId ||
    filters.providerId ||
    filters.apiKeyId ||
    filters.from ||
    filters.to;

  const selectClass =
    "h-8 rounded border border-input bg-background px-2 text-xs w-36 focus:outline-none";

  // Available draggable levels (Period is fixed first and not draggable).
  type DraggableLevel = Exclude<GroupByLevel, "period">;
  const draggableLevels: DraggableLevel[] = (
    ["model", "provider", "apiKey"] as const
  ).filter((l) => l !== "apiKey" || isAdmin);

  // Active draggable levels in user-defined order (excluding period).
  const activeDraggable = filters.groupBy.filter(
    (g): g is DraggableLevel => g !== "period",
  );
  // Inactive levels (rendered after active ones, not part of the order).
  const inactive = draggableLevels.filter((l) => !activeDraggable.includes(l));

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function commitOrder(next: GroupByLevel[]) {
    // Always ensure period stays first.
    const withoutPeriod = next.filter((l) => l !== "period");
    update("groupBy", ["period", ...withoutPeriod]);
  }

  function toggleLevel(level: Exclude<GroupByLevel, "period">) {
    if (activeDraggable.includes(level)) {
      commitOrder(activeDraggable.filter((g) => g !== level));
    } else {
      commitOrder([...activeDraggable, level]);
    }
  }

  function onDragStart(e: React.DragEvent<HTMLButtonElement>, index: number) {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // Some browsers require data to be set for drag to work.
    e.dataTransfer.setData("text/plain", String(index));
  }

  function onDragOver(e: React.DragEvent<HTMLButtonElement>, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overIndex !== index) setOverIndex(index);
  }

  function onDrop(e: React.DragEvent<HTMLButtonElement>, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...activeDraggable];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    commitOrder(next);
    setDragIndex(null);
    setOverIndex(null);
  }

  function onDragEnd() {
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Granularity */}
        <select
          value={filters.granularity}
          onChange={(e) => update("granularity", e.target.value as Granularity)}
          className={selectClass}
        >
          <option value="hour">Hour</option>
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>

        {/* Model */}
        <select
          value={filters.modelId}
          onChange={(e) => update("modelId", e.target.value)}
          className={selectClass}
        >
          <option value="">All Models</option>
          {modelOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        {/* Provider */}
        <select
          value={filters.providerId}
          onChange={(e) => update("providerId", e.target.value)}
          className={selectClass}
        >
          <option value="">All Providers</option>
          {providerOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* API Key (admin only) */}
        {isAdmin && (
          <select
            value={filters.apiKeyId}
            onChange={(e) => update("apiKeyId", e.target.value)}
            className={selectClass}
          >
            <option value="">All Keys</option>
            {apiKeyOptions.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        )}

        {/* Date range */}
        <Input
          type="date"
          value={filters.from}
          onChange={(e) => update("from", e.target.value)}
          className="h-8 w-36 text-xs"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <Input
          type="date"
          value={filters.to}
          onChange={(e) => update("to", e.target.value)}
          className="h-8 w-36 text-xs"
        />

        {/* Clear */}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() =>
              onChange({
                granularity: filters.granularity,
                modelId: "",
                providerId: "",
                apiKeyId: "",
                from: "",
                to: "",
                groupBy: filters.groupBy,
              })
            }
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        )}

        {/* Refresh */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {/* Group by — separate row, drag-to-reorder. Period is fixed first. */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-muted-foreground mr-1">Group by:</span>

        {/* Period — fixed, non-draggable, always first */}
        <button
          type="button"
          className="h-7 rounded px-2 text-xs bg-primary text-primary-foreground cursor-default"
          disabled
          title="Period is fixed as the first grouping level"
        >
          Period
        </button>

        {/* Active draggable levels in user-defined order */}
        {activeDraggable.map((level, index) => (
          <button
            key={level}
            type="button"
            draggable
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={(e) => onDragOver(e, index)}
            onDrop={(e) => onDrop(e, index)}
            onDragEnd={onDragEnd}
            onClick={() => toggleLevel(level)}
            className={cn(
              "h-7 rounded px-2 text-xs border inline-flex items-center gap-1 cursor-grab active:cursor-grabbing",
              "bg-primary text-primary-foreground border-transparent",
              dragIndex === index && "opacity-50",
              overIndex === index &&
                dragIndex !== null &&
                dragIndex !== index &&
                "ring-2 ring-ring",
            )}
            title="Drag to reorder · Click to remove"
          >
            <GripVertical className="h-3 w-3 opacity-70" />
            {GROUP_LABELS[level]}
          </button>
        ))}

        {/* Inactive levels — click to add to the end */}
        {inactive.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => toggleLevel(level)}
            className="h-7 rounded px-2 text-xs border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            title="Click to add"
          >
            {GROUP_LABELS[level]}
          </button>
        ))}
      </div>
    </div>
  );
}
