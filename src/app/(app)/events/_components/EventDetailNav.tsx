"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ShoppingBag, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "",        label: "Dettagli",  icon: CalendarDays },
  { href: "/orders", label: "Ordini",    icon: ShoppingBag },
  { href: "/stats",  label: "Statistiche", icon: BarChart2 },
] as const;

interface Props {
  eventId: string;
  orientation?: "vertical" | "horizontal";
}

export function EventDetailNav({ eventId, orientation = "vertical" }: Props) {
  const pathname = usePathname();
  const base = `/events/${eventId}`;

  if (orientation === "horizontal") {
    return (
      <nav
        className="flex gap-1 overflow-x-auto -mx-4 px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Sezioni evento"
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const fullHref = `${base}${href}`;
          const isActive = href === "" ? pathname === base : pathname.startsWith(fullHref);
          return (
            <Link
              key={href}
              href={fullHref}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors shrink-0 min-h-10",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" strokeWidth={isActive ? 2 : 1.75} />
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const fullHref = `${base}${href}`;
        const isActive = href === "" ? pathname === base : pathname.startsWith(fullHref);
        return (
          <Link
            key={href}
            href={fullHref}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors min-h-11",
              isActive
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={isActive ? 2 : 1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
