"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, X } from "lucide-react";

export type Granularity = "hour" | "day" | "week" | "month";

export interface ReportFilters {
  granularity: Granularity;
  modelId: string;
  providerId: string;
  apiKeyId: string;
  from: string; // ISO date string "YYYY-MM-DD"
  to: string; // ISO date string "YYYY-MM-DD"
}

interface ReportFiltersBarProps {
  filters: ReportFilters;
  onChange: (filters: ReportFilters) => void;
  onRefresh: () => void;
  loading?: boolean;
  modelOptions: string[];
  providerOptions: string[];
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

  return (
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
          <option key={m} value={m}>
            {m}
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
          <option key={p} value={p}>
            {p}
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
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );
}
