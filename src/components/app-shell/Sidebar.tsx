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

      {/* Website link + collapse toggle */}
      <div
        className={cn(
          "flex items-center h-11 shrink-0 border-b border-border",
          collapsed ? "justify-center" : "justify-between pl-5 pr-2",
        )}
      >
        {!collapsed && (
          <a
            href="https://viniferastudioenologico.it"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 truncate text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <Globe className="size-3 shrink-0" />
            <span className="truncate">viniferastudioenologico.it</span>
          </a>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={collapsed ? "Espandi sidebar" : "Comprimi sidebar"}
        >
          <ChevronLeft
            className={cn("size-3.5 transition-transform duration-200", collapsed && "rotate-180")}
            strokeWidth={2}
          />
        </Button>
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

      {/* Footer: versione + badge di credito (ultimo elemento) */}
      <div className="shrink-0 border-t border-border p-2">
        {!collapsed && (
          <p className="px-3 pb-1.5 text-[11px] text-muted-foreground/50 select-none">
            v{pkg.version}
          </p>
        )}

        <div className={cn(collapsed ? "flex justify-center" : "px-1")}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <a
                    href="https://alessiobernardini.dev/qr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex size-8 items-center justify-center rounded-lg border border-border bg-white shadow-sm transition-opacity hover:opacity-90"
                    aria-label="Realizzato da Alessio Bernardini — alessiobernardini.dev"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- next/image blocks local SVGs without dangerouslyAllowSVG */}
                    <img src="/logo_scuro.svg" alt="" width={16} height={16} className="size-4" />
                  </a>
                }
              />
              <TooltipContent side="right" sideOffset={8}>
                Alessio Bernardini · alessiobernardini.dev
              </TooltipContent>
            </Tooltip>
          ) : (
            <a
              href="https://alessiobernardini.dev/qr"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-border bg-white px-2.5 py-1.5 shadow-sm transition-opacity hover:opacity-90"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- next/image blocks local SVGs without dangerouslyAllowSVG */}
              <img src="/logo_scuro.svg" alt="" width={16} height={16} className="size-4 shrink-0" />
              <span className="flex flex-col leading-tight">
                <span className="text-[11px] font-medium" style={{ color: "#06111F" }}>
                  Alessio Bernardini
                </span>
                <span className="text-[9px]" style={{ color: "#2FA7FF" }}>
                  alessiobernardini.dev
                </span>
              </span>
            </a>
          )}
        </div>
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
