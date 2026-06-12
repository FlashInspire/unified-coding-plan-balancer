"use client";

import React, { useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown, Trash2 } from "lucide-react";

interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  idKey: keyof T;
  onDelete?: (id: string) => Promise<void>;
  actions?: (row: T) => React.ReactNode;
  expandable?: boolean;
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

  const totalCols = columns.length + (onDelete || actions ? 1 : 0);

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {expandable && <TableHead className="w-6" />}
          {columns.map((c) => (
            <TableHead key={c.key} className={c.className}>
              {c.label}
            </TableHead>
          ))}
          {(onDelete || actions) && (
            <TableHead className="w-20">Actions</TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={totalCols + (expandable ? 1 : 0)}
              className="h-20 text-center text-muted-foreground"
            >
              No data
            </TableCell>
          </TableRow>
        )}
        {data.map((row, i) => {
          const id = String(row[idKey] ?? i);
          const isExpanded = expandedIds.has(id);
          return (
            <React.Fragment key={id}>
              <TableRow
                className={expandable ? "cursor-pointer" : ""}
                onClick={expandable ? () => toggleExpand(id) : undefined}
              >
                {expandable && (
                  <TableCell className="w-6 text-muted-foreground">
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </TableCell>
                )}
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.className}>
                    {c.render ? c.render(row) : String(row[c.key] ?? "")}
                  </TableCell>
                ))}
                {(onDelete || actions) && (
                  <TableCell className="w-20">
                    <div className="flex items-center gap-1">
                      {actions?.(row)}
                      {onDelete && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
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
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
              {isExpanded && detailRender && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={totalCols + (expandable ? 1 : 0)}
                    className="bg-muted/30 px-6 py-3 text-xs"
                  >
                    {detailRender(row)}
                  </TableCell>
                </TableRow>
              )}
            </React.Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
