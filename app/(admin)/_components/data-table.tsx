"use client";

import React, { useState, useTransition } from "react";

interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  idKey: keyof T;
  onDelete?: (id: string) => Promise<void>;
  actions?: (row: T) => React.ReactNode;
  /** Enable expandable/collapsible rows. Clicking a row toggles its detail panel. */
  expandable?: boolean;
  /** Render the expanded detail panel for a row. */
  detailRender?: (row: T) => React.ReactNode;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  idKey,
  onDelete,
  actions,
  expandable,
  detailRender,
}: DataTableProps<T>) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            {expandable && <th className="px-2 py-2 w-6" />}
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 text-left font-medium">
                {c.label}
              </th>
            ))}
            {(onDelete || actions) && (
              <th className="px-3 py-2 text-left font-medium">Actions</th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 && (
            <tr>
              <td
                colSpan={
                  columns.length +
                  (onDelete || actions ? 1 : 0) +
                  (expandable ? 1 : 0)
                }
                className="px-3 py-6 text-center text-muted-foreground"
              >
                No data
              </td>
            </tr>
          )}
          {data.map((row, i) => {
            const id = String(row[idKey] ?? i);
            const isExpanded = expandedIds.has(id);
            return (
              <React.Fragment key={id}>
                <tr
                  className={`border-b last:border-0 cursor-pointer ${
                    isExpanded ? "bg-muted/20" : ""
                  } hover:bg-muted/10`}
                  onClick={() => toggleExpand(id)}
                >
                  {expandable && (
                    <td className="px-2 py-2 text-muted-foreground text-xs select-none">
                      {isExpanded ? "▼" : "▶"}
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-2">
                      {c.render ? c.render(row) : String(row[c.key] ?? "")}
                    </td>
                  ))}
                  {(onDelete || actions) && (
                    <td className="px-3 py-2 space-x-2">
                      {actions?.(row)}
                      {onDelete && (
                        <button
                          disabled={deleting === id}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!confirm("Delete?")) return;
                            setDeleting(id);
                            startTransition(async () => {
                              await onDelete(id);
                              setDeleting(null);
                            });
                          }}
                          className="text-red-600 hover:underline disabled:opacity-50 text-xs"
                        >
                          {deleting === id ? "..." : "Delete"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                {isExpanded && detailRender && (
                  <tr className="border-b last:border-0 bg-muted/5">
                    <td
                      colSpan={
                        columns.length +
                        (expandable ? 1 : 0) +
                        (onDelete || actions ? 1 : 0)
                      }
                      className="px-6 py-3 text-xs"
                    >
                      {detailRender(row)}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
