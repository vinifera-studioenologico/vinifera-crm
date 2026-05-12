"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const SETTINGS_NAV = [
  { href: "/settings/company", label: "Azienda" },
  { href: "/settings/notifications", label: "Notifiche" },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden lg:flex flex-col w-44 shrink-0 gap-0.5 pt-7">
      {SETTINGS_NAV.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
            pathname === href
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
