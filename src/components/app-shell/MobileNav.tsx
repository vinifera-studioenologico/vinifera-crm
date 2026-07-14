"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  TestTube,
  FileText,
  MoreHorizontal,
  FlaskConical,
  Package,
  ClipboardList,
  CreditCard,
  Bell,
  BarChart2,
  Settings,
  LifeBuoy,
  Coins,
  Globe,
  UserPlus,
  CalendarDays,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const BOTTOM_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clienti", icon: Users },
  { href: "/samples", label: "Campioni", icon: TestTube },
  { href: "/quotes", label: "Preventivi", icon: FileText },
] as const;

const MORE_ITEMS: ReadonlyArray<{
  href: string;
  label: string;
  icon: LucideIcon;
}> = [
  { href: "/analyses", label: "Analisi", icon: FlaskConical },
  { href: "/packages", label: "Pacchetti", icon: Package },
  { href: "/reports", label: "Referti", icon: ClipboardList },
  { href: "/payments", label: "Pagamenti", icon: CreditCard },
  { href: "/reminders", label: "Promemoria", icon: Bell },
  { href: "/stats", label: "Statistiche", icon: BarChart2 },
  { href: "/costs", label: "Costi", icon: Coins },
  { href: "/servizi", label: "Servizi", icon: Globe },
  { href: "/events", label: "Eventi", icon: CalendarDays },
  { href: "/leads", label: "Lead", icon: UserPlus },
  { href: "/support", label: "Supporto", icon: LifeBuoy },
  { href: "/settings/company", label: "Impostazioni", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  const isMoreActive = MORE_ITEMS.some(({ href }) => isActive(href));

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-card/95 backdrop-blur-sm border-t border-border z-40">
      <div className="flex items-stretch h-16">
        {BOTTOM_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors min-h-[44px]",
              isActive(href) ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon
              className={cn("size-5 shrink-0", isActive(href) && "text-primary")}
              strokeWidth={1.75}
            />
            <span>{label}</span>
          </Link>
        ))}

        {/* "Più" — opens sheet */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            render={
              <button
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors min-h-[44px]",
                  isMoreActive ? "text-primary" : "text-muted-foreground",
                )}
              />
            }
          >
            <MoreHorizontal
              className={cn(
                "size-5 shrink-0",
                isMoreActive && "text-primary",
              )}
              strokeWidth={1.75}
            />
            <span>Più</span>
          </SheetTrigger>

          <SheetContent side="bottom" className="h-auto pb-8">
            <SheetHeader className="px-4 pt-2 pb-0">
              <SheetTitle className="text-sm font-medium text-muted-foreground">
                Menu
              </SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-4 gap-2 px-4 pt-3">
              {MORE_ITEMS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setSheetOpen(false)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl text-[11px] font-medium text-center transition-colors",
                    "hover:bg-accent",
                    isActive(href)
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-5 shrink-0" strokeWidth={1.75} />
                  <span className="leading-tight">{label}</span>
                </Link>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
