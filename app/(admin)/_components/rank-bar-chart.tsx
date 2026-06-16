"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export const CHART_COLORS = [
  "hsl(var(--primary))",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
];

export const TOKEN_COLORS = {
  input: "hsl(221, 83%, 53%)",
  cached: "hsl(142, 71%, 38%)",
  output: "hsl(30, 91%, 55%)",
};

export function fmtTokens(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

export interface RankBarChartDataItem {
  name: string;
  calls: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
}

export function RankBarChart({
  title,
  data,
}: {
  title: string;
  data: RankBarChartDataItem[];
}) {
  if (data.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-3">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={data}
            margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
          >
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10 }}
              interval={0}
              angle={-30}
              textAnchor="end"
              height={60}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10 }}
              allowDecimals={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10 }}
              tickFormatter={fmtTokens}
            />
            <Tooltip
              formatter={(value, name) => {
                if (name === "Calls") return [`${value} calls`, "Calls"];
                return [fmtTokens(Number(value)), name];
              }}
              labelFormatter={(l) => String(l)}
            />
            <Bar
              yAxisId="left"
              dataKey="calls"
              name="Calls"
              fill={CHART_COLORS[0]}
              barSize={12}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              yAxisId="right"
              dataKey="input_tokens"
              name="Input"
              stackId="tokens"
              fill={TOKEN_COLORS.input}
              barSize={12}
            />
            <Bar
              yAxisId="right"
              dataKey="cached_input_tokens"
              name="Cached Input"
              stackId="tokens"
              fill={TOKEN_COLORS.cached}
              barSize={12}
            />
            <Bar
              yAxisId="right"
              dataKey="output_tokens"
              name="Output"
              stackId="tokens"
              fill={TOKEN_COLORS.output}
              barSize={12}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
