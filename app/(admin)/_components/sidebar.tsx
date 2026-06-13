"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Server,
  Layers,
  Key,
  BarChart3,
  ScrollText,
  Users,
  Settings,
  LayoutDashboard,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import { useT } from "./i18n-provider";

const NAV_ITEMS = [
  { href: "/", labelKey: "nav.overview", icon: LayoutDashboard },
  { href: "/providers", labelKey: "nav.providers", icon: Server },
  { href: "/models", labelKey: "nav.models", icon: Layers },
  { href: "/api-keys", labelKey: "nav.apiKeys", icon: Key },
  { href: "/quota", labelKey: "nav.quota", icon: BarChart3 },
  { href: "/logs", labelKey: "nav.logs", icon: ScrollText },
  { href: "/users", labelKey: "nav.users", icon: Users },
] as const;

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useT();

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
          {NAV_ITEMS.map((item) => {
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
          <Settings className="h-4 w-4 shrink-0" />
          {t("nav.settings")}
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
