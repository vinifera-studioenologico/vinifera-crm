"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  User,
  FileText,
  FlaskConical,
  Package,
  CreditCard,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "", label: "Panoramica", icon: User },
  { href: "/samples", label: "Campioni", icon: FlaskConical },
  { href: "/quotes", label: "Preventivi", icon: FileText },
  { href: "/packages", label: "Pacchetti", icon: Package },
  { href: "/payments", label: "Pagamenti", icon: CreditCard },
  { href: "/reminders", label: "Promemoria", icon: Bell },
] as const;

interface Props {
  clientId: string;
}

export function ClientDetailNav({ clientId }: Props) {
  const pathname = usePathname();
  const base = `/clients/${clientId}`;

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
