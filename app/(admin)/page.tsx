import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth/nextauth";
import {
  Server,
  Layers,
  Key,
  BarChart3,
  ScrollText,
  Users,
  Settings,
} from "lucide-react";

export default async function AdminHome() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const cards = [
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome to Unified Coding Plan Balancer admin panel.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((card) => (
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
