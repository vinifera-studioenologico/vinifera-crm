"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  CalendarClock,
  Package,
  Tag,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/costs", label: "Riepilogo", icon: LayoutDashboard, exact: true },
  { href: "/costs/expenses", label: "Spese", icon: Receipt },
  { href: "/costs/fixed", label: "Costi fissi", icon: CalendarClock },
  { href: "/costs/kits", label: "Kit", icon: Package },
  { href: "/costs/pricing", label: "Pricing", icon: Tag },
  { href: "/costs/settings", label: "Impostazioni", icon: Settings },
];

export function CostsNav() {
  const pathname = usePathname();

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  }

  return (
    <nav className="hidden lg:flex flex-col w-44 shrink-0 gap-0.5 pt-7">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isActive(item);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.75} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
