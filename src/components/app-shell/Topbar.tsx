"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Sun, Moon, Search, LogOut } from "lucide-react";

import { useAuth } from "@/lib/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const COMMAND_NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clients", label: "Clienti" },
  { href: "/analyses", label: "Analisi" },
  { href: "/packages", label: "Pacchetti" },
  { href: "/samples", label: "Campioni" },
  { href: "/quotes", label: "Preventivi" },
  { href: "/reports", label: "Referti" },
  { href: "/payments", label: "Pagamenti" },
  { href: "/reminders", label: "Promemoria" },
  { href: "/stats", label: "Statistiche" },
  { href: "/settings/company", label: "Impostazioni" },
] as const;

export function Topbar() {
  const { user, signOut } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  // Cmd+K / Ctrl+K � questo e` il pattern corretto: setState e` chiamato
  // nel callback dell'evento, non direttamente nel corpo dell'effect.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleNavigate(href: string) {
    setCommandOpen(false);
    router.push(href);
  }

  function getInitials(email: string | null | undefined) {
    if (!email) return "A";
    return email.charAt(0).toUpperCase();
  }

  return (
    <header className="h-14 shrink-0 border-b border-border bg-card flex items-center px-4 gap-3">
      {/* Search trigger */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setCommandOpen(true)}
        className="flex-1 max-w-64 justify-between text-muted-foreground font-normal"
      >
        <span className="flex items-center gap-2">
          <Search className="size-3.5 shrink-0" strokeWidth={1.75} />
          <span className="text-sm">Cerca...</span>
        </span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
          <span className="text-[11px]">&#8984;</span>K
        </kbd>
      </Button>

      <div className="ml-auto flex items-center gap-1">
        {/* Theme toggle — renderizza l'icona solo dopo l'idratazione per evitare mismatch */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            setTheme(resolvedTheme === "dark" ? "light" : "dark")
          }
          aria-label="Cambia tema"
          className="text-muted-foreground hover:text-foreground"
        >
          {mounted ? (
            resolvedTheme === "dark" ? (
              <Sun className="size-4" strokeWidth={1.75} />
            ) : (
              <Moon className="size-4" strokeWidth={1.75} />
            )
          ) : (
            <Moon className="size-4" strokeWidth={1.75} />
          )}
        </Button>

        {/* Avatar dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex items-center justify-center rounded-full size-9",
              "hover:bg-accent transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {getInitials(user?.email)}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-foreground truncate">
                  {user?.email ?? "Amministratore"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Ruolo: admin
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => void signOut().then(() => { window.location.href = "/login"; })}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <LogOut className="size-4" strokeWidth={1.75} />
              Esci dall&apos;applicazione
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Command palette */}
      <CommandDialog
        open={commandOpen}
        onOpenChange={(open) => setCommandOpen(open)}
        className="sm:max-w-2xl"
      >
        <Command>
          <CommandInput placeholder="Cerca o vai a una sezione…" className="text-base h-12" />
          <CommandList className="max-h-[420px] py-2">
            <CommandEmpty>Nessun risultato trovato.</CommandEmpty>
            <CommandGroup heading="Navigazione">
              {COMMAND_NAV.map((item) => (
                <CommandItem
                  key={item.href}
                  value={item.label}
                  onSelect={() => handleNavigate(item.href)}
                  className="py-3.5 px-4 text-base rounded-lg"
                >
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </header>
  );
}
