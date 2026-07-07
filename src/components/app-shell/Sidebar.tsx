"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FlaskConical,
  Package,
  TestTube,
  FileText,
  ClipboardList,
  CreditCard,
  Bell,
  BarChart2,
  Settings,
  ChevronLeft,
  LifeBuoy,
  Coins,
  Globe,
  UserPlus,
  LineChart,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useNewLeadsCount } from "@/hooks/use-new-leads-count";
import pkg from "../../../package.json";

const NAV_GROUPS = [
  {
    label: "Generale",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Clientela",
    items: [
      { href: "/clients", label: "Clienti", icon: Users },
      { href: "/packages", label: "Pacchetti", icon: Package },
      { href: "/reminders", label: "Promemoria", icon: Bell },
    ],
  },
  {
    label: "Laboratorio",
    items: [
      { href: "/analyses", label: "Analisi", icon: FlaskConical },
      { href: "/samples", label: "Campioni", icon: TestTube },
      { href: "/reports", label: "Referti", icon: ClipboardList },
    ],
  },
  {
    label: "Sito Web",
    items: [
      { href: "/servizi", label: "Servizi", icon: Globe },
      { href: "/leads", label: "Lead", icon: UserPlus },
      { href: "/analytics", label: "Analytics", icon: LineChart },
    ],
  },
  {
    label: "Commerciale",
    items: [
      { href: "/quotes", label: "Preventivi", icon: FileText },
      { href: "/payments", label: "Pagamenti", icon: CreditCard },
      { href: "/stats", label: "Statistiche", icon: BarChart2 },
      { href: "/costs", label: "Costi", icon: Coins },
    ],
  },
] as const;

const SETTINGS_ITEM = {
  href: "/settings/company",
  label: "Impostazioni",
  icon: Settings,
} as const;

const SUPPORT_ITEM = {
  href: "/support",
  label: "Supporto",
  icon: LifeBuoy,
} as const;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const newLeadsCount = useNewLeadsCount();

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-full bg-card border-r border-border shrink-0 overflow-hidden",
        "transition-[width] duration-200 ease-in-out",
        collapsed ? "w-16" : "w-[280px]",
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex items-center h-14 shrink-0 border-b border-border",
          collapsed ? "justify-center" : "gap-2.5 px-5",
        )}
      >
        {collapsed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/icon/icon.png" alt="Vinifera" width={28} height={28} className="shrink-0" />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon/logo.png" alt="Vinifera" className="h-8 w-auto dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon/logo_darkmode.png" alt="Vinifera" className="h-8 w-auto hidden dark:block" />
          </>
        )}
      </div>

      {/* Navigation */}
      <TooltipProvider>
        <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label} className={cn(gi > 0 && "mt-2")}>
              {/* Etichetta gruppo — solo quando espansa */}
              {!collapsed && (
                <span className="block px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none">
                  {group.label}
                </span>
              )}
              {collapsed && gi > 0 && (
                <div className="my-1.5 h-px bg-border mx-1" />
              )}
              {group.items.map(({ href, label, icon }) => (
                <NavItem
                  key={href}
                  href={href}
                  label={label}
                  icon={icon}
                  active={isActive(href)}
                  collapsed={collapsed}
                  badge={href === "/leads" && !!newLeadsCount ? newLeadsCount : undefined}
                />
              ))}
            </div>
          ))}

          <div className="my-2 h-px bg-border" />

          <NavItem
            href={SUPPORT_ITEM.href}
            label={SUPPORT_ITEM.label}
            icon={SUPPORT_ITEM.icon}
            active={isActive(SUPPORT_ITEM.href)}
            collapsed={collapsed}
          />

          <NavItem
            href={SETTINGS_ITEM.href}
            label={SETTINGS_ITEM.label}
            icon={SETTINGS_ITEM.icon}
            active={isActive(SETTINGS_ITEM.href)}
            collapsed={collapsed}
          />
        </nav>
      </TooltipProvider>

      {/* Collapse toggle */}
      <div className="shrink-0 border-t border-border p-2">
        {!collapsed && (
          <p className="px-2 pb-1 text-[11px] text-muted-foreground/50 select-none">
            v{pkg.version}
          </p>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className={cn(
            "h-9 w-full text-muted-foreground hover:text-foreground",
            collapsed ? "justify-center" : "justify-end px-2",
          )}
          aria-label={collapsed ? "Espandi sidebar" : "Comprimi sidebar"}
        >
          <ChevronLeft
            className={cn(
              "size-4 transition-transform duration-200",
              collapsed && "rotate-180",
            )}
            strokeWidth={1.75}
          />
        </Button>
      </div>
    </aside>
  );
}

interface NavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  badge?: number;
}

function NavItem({ href, label, icon: Icon, active, collapsed, badge }: NavItemProps) {
  const itemClass = cn(
    "flex items-center h-10 rounded-lg text-sm font-medium transition-colors",
    "hover:bg-accent hover:text-accent-foreground",
    active ? "bg-primary/10 text-primary" : "text-muted-foreground",
    collapsed ? "w-10 justify-center mx-auto" : "gap-3 px-3 w-full",
  );

  const iconEl = (
    <div className="relative">
      <Icon
        className={cn("size-[18px] shrink-0", active && "text-primary")}
        strokeWidth={1.75}
      />
      {/* Dot on icon when sidebar is collapsed */}
      {badge && collapsed ? (
        <span className="absolute -top-1 -right-1 size-2 rounded-full bg-destructive" />
      ) : null}
    </div>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Link href={href} className={itemClass}>
              {iconEl}
            </Link>
          }
        />
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link href={href} className={itemClass}>
      {iconEl}
      <span className="truncate">{label}</span>
      {badge ? (
        <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}
