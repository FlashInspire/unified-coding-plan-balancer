"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "./_components/api";
import { useT } from "./_components/i18n-provider";
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
  ScrollText,
  Users,
  Settings,
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
  modelCounts: ModelCount[];
  tokenCounts: TokenCount[];
}

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
  const t = useT();
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
        <h1 className="text-sm font-semibold">{t("page.dashboard.title")}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("dashboard.welcome")}
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
            label={t("dashboard.stats.requests1h")}
            value={rc.hour}
            pct={(rc.hour / maxRequests) * 100}
            color="hsl(var(--primary))"
          />
          <StatCard
            label={t("dashboard.stats.requests1d")}
            value={rc.day}
            pct={(rc.day / maxRequests) * 100}
            color="hsl(221, 83%, 53%)"
          />
          <StatCard
            label={t("dashboard.stats.requests1w")}
            value={rc.week}
            pct={(rc.week / maxRequests) * 100}
            color="hsl(142, 71%, 38%)"
          />
          <StatCard
            label={t("dashboard.stats.requests1m")}
            value={rc.month}
            pct={(rc.month / maxRequests) * 100}
            color="hsl(30, 91%, 55%)"
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
                {t("dashboard.chart.modelCallCount")}
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
                {t("dashboard.chart.noData")}
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
                {t("dashboard.chart.tokenUsage")}
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
                {t("dashboard.chart.noTokenData")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Navigation cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {([
          {
            href: "/providers",
            label: t("dashboard.nav.providers"),
            icon: Server,
            desc: t("dashboard.nav.providersDesc"),
          },
          {
            href: "/models",
            label: t("dashboard.nav.models"),
            icon: Layers,
            desc: t("dashboard.nav.modelsDesc"),
          },
          {
            href: "/api-keys",
            label: t("dashboard.nav.apiKeys"),
            icon: Key,
            desc: t("dashboard.nav.apiKeysDesc"),
          },
          {
            href: "/logs",
            label: t("dashboard.nav.logs"),
            icon: ScrollText,
            desc: t("dashboard.nav.logsDesc"),
          },
          {
            href: "/users",
            label: t("dashboard.nav.users"),
            icon: Users,
            desc: t("dashboard.nav.usersDesc"),
          },
          {
            href: "/settings",
            label: t("dashboard.nav.settings"),
            icon: Settings,
            desc: t("dashboard.nav.settingsDesc"),
          },
        ] as const).map((card) => (
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
