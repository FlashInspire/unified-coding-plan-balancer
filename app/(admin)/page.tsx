"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "./_components/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Server,
  Layers,
  Key,
  BarChart3,
  ScrollText,
  Users,
  Settings,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Zap,
} from "lucide-react";

const PERIODS = [
  { value: "hour", label: "1h" },
  { value: "day", label: "1d" },
  { value: "week", label: "1w" },
  { value: "month", label: "1m" },
] as const;

type Period = (typeof PERIODS)[number]["value"];

interface TokenCount {
  model_id: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
}

interface ModelCount {
  model_id: string;
  requests: number;
}

interface DashboardData {
  requestCounts: { hour: number; day: number; week: number; month: number };
  quotaSummary: { total: number; nearLimit: number };
  modelCounts: ModelCount[];
  tokenCounts: TokenCount[];
}

const CARDS = [
  {
    href: "/providers",
    label: "Providers",
    icon: Server,
    desc: "Manage upstream providers",
  },
  {
    href: "/models",
    label: "Models",
    icon: Layers,
    desc: "Configure models & provider mappings",
  },
  {
    href: "/api-keys",
    label: "API Keys",
    icon: Key,
    desc: "Manage bearer tokens",
  },
  {
    href: "/quota",
    label: "Quota",
    icon: BarChart3,
    desc: "Provider quota snapshots",
  },
  {
    href: "/logs",
    label: "Logs & Usage",
    icon: ScrollText,
    desc: "Request logs & aggregated usage",
  },
  {
    href: "/users",
    label: "Users",
    icon: Users,
    desc: "Admin user management",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    desc: "Account settings",
  },
];

const CHART_COLORS = [
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
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
];

const TOKEN_COLORS = {
  input: "hsl(221, 83%, 53%)", // blue
  cached: "hsl(142, 71%, 38%)", // green
  output: "hsl(30, 91%, 55%)", // orange
};

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function AdminHome() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("week");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const r = await apiFetch<DashboardData>(
          `/api/admin/dashboard?period=${period}`,
        );
        if (!cancelled) setData(r);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    queueMicrotask(() => void load());
    return () => {
      cancelled = true;
    };
  }, [period]);

  const rc = data?.requestCounts;
  const maxRequests = rc ? Math.max(rc.hour, rc.day, rc.week, rc.month, 1) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome to Unified Coding Plan Balancer admin panel.
        </p>
      </div>

      {/* Stats row */}
      {loading ? (
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : data && rc ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            label="Requests (1h)"
            value={rc.hour}
            pct={(rc.hour / maxRequests) * 100}
            color="hsl(var(--primary))"
          />
          <StatCard
            label="Requests (1d)"
            value={rc.day}
            pct={(rc.day / maxRequests) * 100}
            color="hsl(221, 83%, 53%)"
          />
          <StatCard
            label="Requests (1w)"
            value={rc.week}
            pct={(rc.week / maxRequests) * 100}
            color="hsl(142, 71%, 38%)"
          />
          <StatCard
            label="Requests (1m)"
            value={rc.month}
            pct={(rc.month / maxRequests) * 100}
            color="hsl(30, 91%, 55%)"
          />
          <QuotaStatCard
            nearLimit={data.quotaSummary.nearLimit}
            total={data.quotaSummary.total}
          />
        </div>
      ) : null}

      {/* Charts section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Model Call Count */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                Model Call Count
              </CardTitle>
              <Tabs
                value={period}
                onValueChange={(v) => setPeriod(v as Period)}
              >
                <TabsList variant="line" className="h-7">
                  {PERIODS.map((p) => (
                    <TabsTrigger
                      key={p.value}
                      value={p.value}
                      className="text-[10px] px-2 py-0"
                    >
                      {p.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : data && data.modelCounts.length > 0 ? (
              <ResponsiveContainer
                width="100%"
                height={Math.max(200, data.modelCounts.length * 32)}
              >
                <BarChart
                  data={data.modelCounts}
                  layout="vertical"
                  margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
                >
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="model_id"
                    tick={{ fontSize: 10 }}
                    width={120}
                  />
                  <Tooltip
                    formatter={(value) => [`${value} calls`, "Requests"]}
                    labelFormatter={(label) => `Model: ${label}`}
                  />
                  <Bar dataKey="requests" radius={[0, 3, 3, 0]} barSize={16}>
                    {data.modelCounts.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-muted-foreground py-8 text-center">
                No data for this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Token Usage */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                Token Usage
              </CardTitle>
              <Tabs
                value={period}
                onValueChange={(v) => setPeriod(v as Period)}
              >
                <TabsList variant="line" className="h-7">
                  {PERIODS.map((p) => (
                    <TabsTrigger
                      key={p.value}
                      value={p.value}
                      className="text-[10px] px-2 py-0"
                    >
                      {p.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : data && data.tokenCounts.length > 0 ? (
              <ResponsiveContainer
                width="100%"
                height={Math.max(200, data.tokenCounts.length * 32)}
              >
                <BarChart
                  data={data.tokenCounts}
                  layout="vertical"
                  margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10 }}
                    tickFormatter={fmtTokens}
                  />
                  <YAxis
                    type="category"
                    dataKey="model_id"
                    tick={{ fontSize: 10 }}
                    width={120}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      fmtTokens(Number(value)),
                      String(name).replace(/_/g, " "),
                    ]}
                    labelFormatter={(label) => `Model: ${label}`}
                  />
                  <Bar
                    dataKey="input_tokens"
                    name="Input"
                    stackId="tokens"
                    fill={TOKEN_COLORS.input}
                    barSize={16}
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="cached_input_tokens"
                    name="Cached Input"
                    stackId="tokens"
                    fill={TOKEN_COLORS.cached}
                    barSize={16}
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="output_tokens"
                    name="Output"
                    stackId="tokens"
                    fill={TOKEN_COLORS.output}
                    barSize={16}
                    radius={[0, 3, 3, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-muted-foreground py-8 text-center">
                No token data for this period
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Navigation cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <card.icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              <div>
                <div className="text-sm font-medium">{card.label}</div>
                <div className="text-xs text-muted-foreground">{card.desc}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  pct: number;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <div
          className="h-2 rounded-full shrink-0"
          style={{
            width: "4px",
            backgroundColor: color ?? "hsl(var(--primary))",
          }}
        />
        <div>
          <div className="text-lg font-semibold tabular-nums">
            {typeof value === "number" ? value.toLocaleString() : value}
          </div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuotaStatCard({
  nearLimit,
  total,
}: {
  nearLimit: number;
  total: number;
}) {
  const hasIssues = nearLimit > 0;
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3 px-4">
        {hasIssues ? (
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
        ) : (
          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
        )}
        <div>
          <div className="text-lg font-semibold tabular-nums">
            {hasIssues ? `${nearLimit}/${total}` : "OK"}
          </div>
          <div className="text-xs text-muted-foreground">
            {hasIssues ? "Near limit" : "Quota Usage"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
