"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "./_components/api";
import { CircularProgress } from "./_components/circular-progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";

interface DashboardData {
  requestCounts: { hour: number; day: number; week: number; month: number };
  quotaSummary: { total: number; nearLimit: number };
  modelCounts: { model_id: string; requests: number }[];
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

export default function AdminHome() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    queueMicrotask(async () => {
      try {
        const r = await apiFetch<DashboardData>("/api/admin/dashboard");
        setData(r);
      } finally {
        setLoading(false);
      }
    });
  }, []);

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
          />
          <StatCard
            label="Requests (1d)"
            value={rc.day}
            pct={(rc.day / maxRequests) * 100}
          />
          <StatCard
            label="Requests (1w)"
            value={rc.week}
            pct={(rc.week / maxRequests) * 100}
          />
          <StatCard
            label="Requests (1m)"
            value={rc.month}
            pct={(rc.month / maxRequests) * 100}
          />
          <StatCard
            label="Quota Usage"
            value={
              data.quotaSummary.nearLimit > 0
                ? `${data.quotaSummary.nearLimit}/${data.quotaSummary.total}`
                : "OK"
            }
            pct={
              data.quotaSummary.total > 0
                ? (data.quotaSummary.nearLimit / data.quotaSummary.total) * 100
                : 0
            }
            color={
              data.quotaSummary.nearLimit > 0
                ? "hsl(var(--destructive))"
                : "hsl(142, 71%, 45%)"
            }
          />
        </div>
      ) : null}

      {/* Model leaderboard */}
      {data && data.modelCounts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Model Call Count (7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer
              width="100%"
              height={Math.max(200, data.modelCounts.length * 32)}
            >
              <BarChart
                data={data.modelCounts}
                layout="vertical"
                margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
              >
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="model_id"
                  tick={{ fontSize: 11 }}
                  width={140}
                />
                <Tooltip
                  formatter={(value) => [`${value} calls`, "Requests"]}
                  labelFormatter={(label) => `Model: ${label}`}
                />
                <Bar dataKey="requests" radius={[0, 4, 4, 0]} barSize={20}>
                  {data.modelCounts.map((_, i) => (
                    <Cell
                      key={i}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

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
  pct,
  color,
}: {
  label: string;
  value: number | string;
  pct: number;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <CircularProgress value={pct} size={48} color={color} />
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
