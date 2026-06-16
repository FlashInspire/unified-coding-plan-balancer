"use client";

import React, { useState, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn, displayName } from "@/lib/utils";
import type { AggregateReportRow } from "@/lib/metrics/queryRouter";

export type GroupByLevel = "period" | "model" | "provider" | "apiKey";

interface AggregatedMetrics {
  requests: number;
  requests_ok: number;
  requests_err: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  ttft_ms_sum: number;
  ttft_ms_count: number;
  tps_out_sum: number;
  tps_out_count: number;
}

interface TreeNode {
  id: string;
  key: string;
  label: string;
  children: TreeNode[];
  depth: number;
  metrics: AggregatedMetrics;
  isLeaf: boolean;
}

interface GroupedReportTableProps {
  rows: AggregateReportRow[];
  levels: GroupByLevel[];
  fmtPeriod: (periodMs: number) => string;
  fmtTokens: (v: number) => string;
}

function aggregateMetrics(rows: AggregateReportRow[]): AggregatedMetrics {
  return rows.reduce(
    (acc, r) => {
      acc.requests += r.requests;
      acc.requests_ok += r.requests_ok;
      acc.requests_err += r.requests_err;
      acc.input_tokens += r.input_tokens;
      acc.cached_input_tokens += r.cached_input_tokens;
      acc.output_tokens += r.output_tokens;
      acc.ttft_ms_sum += r.ttft_ms_sum;
      acc.ttft_ms_count += r.ttft_ms_count;
      acc.tps_out_sum += r.tps_out_sum;
      acc.tps_out_count += r.tps_out_count;
      return acc;
    },
    {
      requests: 0,
      requests_ok: 0,
      requests_err: 0,
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      ttft_ms_sum: 0,
      ttft_ms_count: 0,
      tps_out_sum: 0,
      tps_out_count: 0,
    },
  );
}

function getKey(r: AggregateReportRow, level: GroupByLevel): string {
  switch (level) {
    case "period":
      return String(r.period_start);
    case "model":
      return r.model_id;
    case "provider":
      return r.provider_id;
    case "apiKey":
      return r.api_key_id;
  }
}

function getLabel(
  level: GroupByLevel,
  _key: string,
  r: AggregateReportRow,
  fmtPeriod: (periodMs: number) => string,
): string {
  switch (level) {
    case "period":
      return fmtPeriod(r.period_start);
    case "model":
      return displayName(r.model_name, r.model_id);
    case "provider":
      return displayName(r.provider_name, r.provider_id);
    case "apiKey":
      return displayName(r.api_key_name, r.api_key_id);
  }
}

function buildTree(
  rows: AggregateReportRow[],
  levels: GroupByLevel[],
  fmtPeriod: (periodMs: number) => string,
): TreeNode[] {
  function group(
    data: AggregateReportRow[],
    depth: number,
    parentId: string,
  ): TreeNode[] {
    if (depth >= levels.length) {
      return [];
    }
    const level = levels[depth];
    const isLast = depth === levels.length - 1;

    const groups = new Map<string, AggregateReportRow[]>();
    for (const r of data) {
      const key = getKey(r, level);
      const g = groups.get(key);
      if (g) g.push(r);
      else groups.set(key, [r]);
    }

    const entries = [...groups.entries()].map(
      ([key, groupRows]) =>
        [key, groupRows, aggregateMetrics(groupRows)] as const,
    );

    if (level === "period") {
      entries.sort((a, b) => Number(b[0]) - Number(a[0]));
    } else {
      entries.sort((a, b) => b[2].requests - a[2].requests);
    }

    return entries.map(([key, groupRows, metrics]) => {
      // Include the parent's id in this node's id so that the same key under
      // different parents (e.g. the same model under two different periods)
      // gets a unique tree path. Without this, expanding one branch would
      // accidentally expand every branch sharing the same (depth, level, key).
      const id = `${parentId}/${depth}-${level}-${key}`;
      const children = isLast ? [] : group(groupRows, depth + 1, id);
      const firstRow = groupRows[0];

      return {
        id,
        key,
        label: getLabel(level, key, firstRow, fmtPeriod),
        children,
        depth,
        metrics,
        isLeaf: isLast,
      };
    });
  }

  return group(rows, 0, "root");
}

function displayMetrics(m: AggregatedMetrics): {
  avg_ttft_ms: number | null;
  avg_tps_out: number | null;
} {
  return {
    avg_ttft_ms: m.ttft_ms_count > 0 ? m.ttft_ms_sum / m.ttft_ms_count : null,
    avg_tps_out: m.tps_out_count > 0 ? m.tps_out_sum / m.tps_out_count : null,
  };
}

export function GroupedReportTable({
  rows,
  levels,
  fmtPeriod,
  fmtTokens,
}: GroupedReportTableProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const tree = React.useMemo(
    () => buildTree(rows, levels, fmtPeriod),
    [rows, levels, fmtPeriod],
  );

  const renderRows: React.ReactNode[] = [];
  function walk(nodes: TreeNode[]) {
    for (const node of nodes) {
      const isExpanded = expandedIds.has(node.id);
      const { avg_ttft_ms, avg_tps_out } = displayMetrics(node.metrics);

      renderRows.push(
        <TableRow
          key={node.id}
          className={cn(
            !node.isLeaf ? "cursor-pointer hover:bg-muted/50" : "",
            node.isLeaf && node.depth > 0 ? "bg-muted/20" : "",
          )}
          onClick={!node.isLeaf ? () => toggle(node.id) : undefined}
        >
          <TableCell
            className="text-xs"
            style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
          >
            <div className="flex items-center gap-1">
              {!node.isLeaf ? (
                isExpanded ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                )
              ) : (
                <span className="w-3 shrink-0" />
              )}
              <span className="truncate">{node.label}</span>
            </div>
          </TableCell>
          <TableCell className="w-[55px] text-right">
            <span className="text-xs tabular-nums">
              {node.metrics.requests}
            </span>
          </TableCell>
          <TableCell className="w-[50px] text-right">
            <Badge
              variant="default"
              className="text-[10px] bg-green-600 font-mono"
            >
              {node.metrics.requests_ok}
            </Badge>
          </TableCell>
          <TableCell className="w-[50px] text-right">
            {node.metrics.requests_err > 0 ? (
              <Badge variant="destructive" className="text-[10px] font-mono">
                {node.metrics.requests_err}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">0</span>
            )}
          </TableCell>
          <TableCell className="w-[65px] text-right">
            <span className="text-xs tabular-nums">
              {fmtTokens(node.metrics.input_tokens)}
            </span>
          </TableCell>
          <TableCell className="w-[65px] text-right">
            <span className="text-xs tabular-nums">
              {fmtTokens(node.metrics.cached_input_tokens)}
            </span>
          </TableCell>
          <TableCell className="w-[65px] text-right">
            <span className="text-xs tabular-nums">
              {fmtTokens(node.metrics.output_tokens)}
            </span>
          </TableCell>
          <TableCell className="w-[75px]">
            <span className="text-xs tabular-nums">
              {avg_ttft_ms == null ? "—" : `${avg_ttft_ms.toFixed(0)}ms`}
            </span>
          </TableCell>
          <TableCell className="w-[65px]">
            <span className="text-xs tabular-nums">
              {avg_tps_out == null ? "—" : `${avg_tps_out.toFixed(1)}`}
            </span>
          </TableCell>
        </TableRow>,
      );

      if (isExpanded && node.children.length > 0) {
        walk(node.children);
      }
    }
  }

  walk(tree);

  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[300px]">Label</TableHead>
          <TableHead className="w-[55px] text-right">Reqs</TableHead>
          <TableHead className="w-[50px] text-right">OK</TableHead>
          <TableHead className="w-[50px] text-right">Err</TableHead>
          <TableHead className="w-[65px] text-right">In Tok</TableHead>
          <TableHead className="w-[65px] text-right">Cached</TableHead>
          <TableHead className="w-[65px] text-right">Out Tok</TableHead>
          <TableHead className="w-[75px]">Avg TTFT</TableHead>
          <TableHead className="w-[65px]">Avg TPS</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {renderRows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={9}
              className="h-20 text-center text-muted-foreground"
            >
              No data
            </TableCell>
          </TableRow>
        ) : (
          renderRows
        )}
      </TableBody>
    </Table>
  );
}
