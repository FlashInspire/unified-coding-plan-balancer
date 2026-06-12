"use client";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import type { ModelRow } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ModelListProps {
  models: ModelRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  providerCounts: Record<string, number>;
}

export function ModelList({
  models,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  providerCounts,
}: ModelListProps) {
  const filtered = models.filter(
    (m) =>
      m.id.toLowerCase().includes(search.toLowerCase()) ||
      m.displayName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search models..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground text-center">
            No models found
          </div>
        ) : (
          <div className="py-1">
            {[...filtered]
              .sort((a, b) =>
                a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1,
              )
              .map((m) => (
                <button
                  key={m.id}
                  onClick={() => onSelect(m.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-accent/50",
                    selectedId === m.id && "bg-accent",
                    !m.enabled && "opacity-50",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{m.displayName}</div>
                    <div className="text-muted-foreground font-mono truncate">
                      {m.id}
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {providerCounts[m.id] ?? 0}p
                  </Badge>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
