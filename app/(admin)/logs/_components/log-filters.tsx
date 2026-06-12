"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, RefreshCw } from "lucide-react";

export interface LogFilters {
  search: string;
  status: string;
  modelId: string;
  providerId: string;
}

interface LogFiltersBarProps {
  filters: LogFilters;
  onChange: (filters: LogFilters) => void;
  onRefresh: () => void;
  loading?: boolean;
  modelOptions: string[];
  providerOptions: string[];
}

export function LogFiltersBar({
  filters,
  onChange,
  onRefresh,
  loading,
  modelOptions,
  providerOptions,
}: LogFiltersBarProps) {
  function update<K extends keyof LogFilters>(key: K, value: LogFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  const hasFilters =
    filters.search || filters.status || filters.modelId || filters.providerId;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search model, key, provider..."
          value={filters.search}
          onChange={(e) => update("search", e.target.value)}
          className="pl-8 h-8 w-56 text-xs"
        />
      </div>
      <select
        value={filters.status}
        onChange={(e) => update("status", e.target.value)}
        className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <option value="">All Status</option>
        <option value="ok">OK (2xx)</option>
        <option value="error">Error</option>
        <option value="inflight">In-flight</option>
      </select>
      <select
        value={filters.modelId}
        onChange={(e) => update("modelId", e.target.value)}
        className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <option value="">All Models</option>
        {modelOptions.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        value={filters.providerId}
        onChange={(e) => update("providerId", e.target.value)}
        className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <option value="">All Providers</option>
        {providerOptions.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      {hasFilters && (
        <Button
          variant="ghost"
          size="xs"
          onClick={() =>
            onChange({ search: "", status: "", modelId: "", providerId: "" })
          }
        >
          <X className="h-3 w-3" />
          Clear
        </Button>
      )}
      <Button
        variant="outline"
        size="xs"
        onClick={onRefresh}
        disabled={loading}
      >
        <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        Refresh
      </Button>
    </div>
  );
}
