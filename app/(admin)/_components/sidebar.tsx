"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Server,
  Layers,
  Key,
  ScrollText,
  Users,
  Settings,
  LayoutDashboard,
  Menu,
  BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import { useT } from "./i18n-provider";
import { useSession } from "next-auth/react";

/** All nav items with their required role. */
const NAV_ITEMS = [
  {
    href: "/",
    labelKey: "nav.overview",
    icon: LayoutDashboard,
    roles: ["admin", "user"],
  },
  {
    href: "/logs",
    labelKey: "nav.logs",
    icon: ScrollText,
    roles: ["admin", "user"],
  },
  {
    href: "/providers",
    labelKey: "nav.providers",
    icon: Server,
    roles: ["admin"],
  },
  { href: "/models", labelKey: "nav.models", icon: Layers, roles: ["admin"] },
  {
    href: "/api-keys",
    labelKey: "nav.apiKeys",
    icon: Key,
    roles: ["admin", "user"],
  },
  {
    href: "/report",
    labelKey: "nav.report",
    icon: BarChart2,
    roles: ["admin", "user"],
  },
  { href: "/users", labelKey: "nav.users", icon: Users, roles: ["admin"] },
] as const;

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useT();
  const { data: session } = useSession();
  const user = session?.user as
    | {
        role?: string;
        displayName?: string | null;
        avatarUrl?: string | null;
        name?: string | null;
      }
    | undefined;
  const role = user?.role ?? "user";

  const visibleItems = NAV_ITEMS.filter((item) =>
    (item.roles as readonly string[]).includes(role),
  );

  const displayName = user?.displayName || user?.name || "?";
  const initial = displayName[0].toUpperCase();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-5 border-b border-sidebar-border">
        <Link
          href="/"
          className="font-bold text-sm tracking-tight text-sidebar-foreground"
          onClick={onNavigate}
        >
          {t("sidebar.logo")}
        </Link>
      </div>
      <ScrollArea className="flex-1 py-2">
        <nav className="flex flex-col gap-0.5 px-3">
          {visibleItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
      <div className="border-t border-sidebar-border p-3">
        {/* User info */}
        <Link
          href="/settings"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            pathname === "/settings" || pathname.startsWith("/settings")
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
          )}
        >
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">
              {initial}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{displayName}</div>
            <div className="truncate text-[10px] text-muted-foreground">
              {t("nav.settings")}
            </div>
          </div>
          <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden lg:flex lg:w-60 lg:shrink-0 lg:flex-col border-r border-sidebar-border bg-sidebar">
      <NavContent />
    </aside>
  );
}

export function MobileSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="lg:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-60 p-0 bg-sidebar">
        <NavContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
