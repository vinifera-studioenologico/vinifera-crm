"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Sun, Moon, Search, LogOut, KeyRound, Users, FlaskConical, FileText, ClipboardList, Loader2, Package, TestTube, Bell, Banknote } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { formatEUR } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";
import { searchGlobal } from "@/server/actions/search";
import type { GlobalSearchResults } from "@/lib/search";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
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

const SAMPLE_STATUS_LABELS: Record<string, string> = {
  pending: "In attesa",
  in_progress: "In lavorazione",
  completed: "Completato",
  cancelled: "Annullato",
};

const REMINDER_STATUS_LABELS: Record<string, string> = {
  pending: "In attesa",
  done: "Completato",
  snoozed: "Posticipato",
  cancelled: "Annullato",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "In attesa",
  partial: "Parziale",
  paid: "Pagato",
  overdue: "Scaduto",
  cancelled: "Annullato",
};

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
  const [commandQuery, setCommandQuery] = useState("");
  const [_searchResults, setSearchResults] = useState<GlobalSearchResults | null>(null);
  const [_isSearching, setIsSearching] = useState(false);
  const [mounted, setMounted] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived: suppress stale state when the query is too short to search
  const queryTrimmed = commandQuery.trim();
  const searchResults = queryTrimmed.length >= 2 ? _searchResults : null;
  const isSearching = queryTrimmed.length >= 2 && _isSearching;

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  // Ricerca con debounce 300ms — chiama il Server Action solo quando la query
  // è di almeno 2 caratteri.
  useEffect(() => {
    const q = commandQuery.trim();
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (q.length < 2) return;
    searchTimerRef.current = setTimeout(() => {
      setSearchResults(null);
      setIsSearching(true);
      void searchGlobal(q).then((res) => {
        setSearchResults(res);
        setIsSearching(false);
      });
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [commandQuery]);

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
    setCommandQuery("");
    setSearchResults(null);
    router.push(href);
  }

  function handleGlobalSearch(q: string) {
    setCommandOpen(false);
    setCommandQuery("");
    setSearchResults(null);
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  function getInitials(email: string | null | undefined) {
    if (!email) return "A";
    return email.charAt(0).toUpperCase();
  }

  async function handleResetPassword() {
    if (!user?.email) return;
    try {
      const res = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Email per il cambio password inviata a ${user.email}`);
    } catch {
      toast.error("Impossibile inviare l'email di cambio password.");
    }
  }

  return (
    <header className="h-14 shrink-0 border-b border-border bg-card flex items-center px-4 gap-3">
      {/* Search trigger */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setCommandOpen(true)}
        className="flex-1 md:max-w-64 justify-between text-muted-foreground font-normal"
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
              onClick={() => void handleResetPassword()}
              className="gap-2"
            >
              <KeyRound className="size-4" strokeWidth={1.75} />
              Cambia password
            </DropdownMenuItem>
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
        onOpenChange={(open) => {
          setCommandOpen(open);
          if (!open) {
            setCommandQuery("");
            setSearchResults(null);
          }
        }}
        className="sm:max-w-2xl"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Cerca clienti, campioni, preventivi…"
            className="text-base h-12"
            value={commandQuery}
            onValueChange={setCommandQuery}
          />
          <CommandList className="max-h-[420px] py-2">

            {/* ── Navigazione (query vuota / corta) ─────────────────── */}
            {commandQuery.trim().length < 2 && (
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
            )}

            {/* ── Risultati ricerca (query >= 2 caratteri) ──────────── */}
            {commandQuery.trim().length >= 2 && (
              <>
                {/* Loading */}
                {isSearching && (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
                    Ricerca in corso…
                  </div>
                )}

                {/* Nessun risultato */}
                {!isSearching && searchResults && searchResults.total === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Nessun risultato per &ldquo;{commandQuery}&rdquo;
                  </div>
                )}

                {/* Clienti */}
                {!isSearching && searchResults && searchResults.clients.length > 0 && (
                  <CommandGroup heading="Clienti">
                    {searchResults.clients.map((hit) => (
                      <CommandItem
                        key={hit.id}
                        value={`client-${hit.id}`}
                        onSelect={() => handleNavigate(`/clients/${hit.id}`)}
                        className="px-4 py-2.5 rounded-lg gap-3"
                      >
                        <Users className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{hit.displayName}</p>
                          <p className="text-xs text-muted-foreground truncate">{hit.email}</p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {hit.type === "business" ? "Azienda" : "Privato"}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {/* Campioni */}
                {!isSearching && searchResults && searchResults.samples.length > 0 && (
                  <CommandGroup heading="Campioni">
                    {searchResults.samples.map((hit) => (
                      <CommandItem
                        key={hit.id}
                        value={`sample-${hit.id}`}
                        onSelect={() => handleNavigate(`/samples/${hit.id}`)}
                        className="px-4 py-2.5 rounded-lg gap-3"
                      >
                        <FlaskConical className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono font-medium truncate">{hit.code}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {hit.sampleName}{hit.clientName ? ` · ${hit.clientName}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {SAMPLE_STATUS_LABELS[hit.status] ?? hit.status}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {/* Preventivi */}
                {!isSearching && searchResults && searchResults.quotes.length > 0 && (
                  <CommandGroup heading="Preventivi">
                    {searchResults.quotes.map((hit) => (
                      <CommandItem
                        key={hit.id}
                        value={`quote-${hit.id}`}
                        onSelect={() => handleNavigate(`/quotes/${hit.id}`)}
                        className="px-4 py-2.5 rounded-lg gap-3"
                      >
                        <FileText className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono font-medium truncate">{hit.number}</p>
                          {hit.clientName && (
                            <p className="text-xs text-muted-foreground truncate">{hit.clientName}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-sm font-medium tabular-nums">
                          {formatEUR(hit.totalCents)}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {/* Referti */}
                {!isSearching && searchResults && searchResults.reports.length > 0 && (
                  <CommandGroup heading="Referti">
                    {searchResults.reports.map((hit) => (
                      <CommandItem
                        key={hit.id}
                        value={`report-${hit.id}`}
                        onSelect={() => handleNavigate(`/reports/${hit.id}`)}
                        className="px-4 py-2.5 rounded-lg gap-3"
                      >
                        <ClipboardList className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono font-medium truncate">{hit.number}</p>
                          {hit.clientName && (
                            <p className="text-xs text-muted-foreground truncate">{hit.clientName}</p>
                          )}
                        </div>
                        {hit.generatedAt && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatDate(hit.generatedAt)}
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {/* Pacchetti */}
                {!isSearching && searchResults && searchResults.packages.length > 0 && (
                  <CommandGroup heading="Pacchetti">
                    {searchResults.packages.map((hit) => (
                      <CommandItem
                        key={hit.id}
                        value={`package-${hit.id}`}
                        onSelect={() => handleNavigate("/packages")}
                        className="px-4 py-2.5 rounded-lg gap-3"
                      >
                        <Package className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{hit.name}</p>
                          {hit.description && (
                            <p className="text-xs text-muted-foreground truncate">{hit.description}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-sm font-medium tabular-nums">
                          {formatEUR(hit.priceCents)}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {/* Analisi */}
                {!isSearching && searchResults && searchResults.analyses.length > 0 && (
                  <CommandGroup heading="Analisi">
                    {searchResults.analyses.map((hit) => (
                      <CommandItem
                        key={hit.id}
                        value={`analysis-${hit.id}`}
                        onSelect={() => handleNavigate("/analyses")}
                        className="px-4 py-2.5 rounded-lg gap-3"
                      >
                        <TestTube className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono font-medium truncate">{hit.code}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {hit.name}{hit.category ? ` · ${hit.category}` : ""}
                          </p>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {/* Promemoria */}
                {!isSearching && searchResults && searchResults.reminders.length > 0 && (
                  <CommandGroup heading="Promemoria">
                    {searchResults.reminders.map((hit) => (
                      <CommandItem
                        key={hit.id}
                        value={`reminder-${hit.id}`}
                        onSelect={() => handleNavigate("/reminders")}
                        className="px-4 py-2.5 rounded-lg gap-3"
                      >
                        <Bell className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{hit.title}</p>
                          {hit.description && (
                            <p className="text-xs text-muted-foreground truncate">{hit.description}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {REMINDER_STATUS_LABELS[hit.status] ?? hit.status}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {/* Pagamenti */}
                {!isSearching && searchResults && searchResults.payments.length > 0 && (
                  <CommandGroup heading="Pagamenti">
                    {searchResults.payments.map((hit) => (
                      <CommandItem
                        key={hit.id}
                        value={`payment-${hit.id}`}
                        onSelect={() => handleNavigate("/payments")}
                        className="px-4 py-2.5 rounded-lg gap-3"
                      >
                        <Banknote className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{hit.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {PAYMENT_STATUS_LABELS[hit.status] ?? hit.status}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-medium tabular-nums">
                          {formatEUR(hit.totalAmountCents)}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {/* Footer: vedi tutti */}
                {!isSearching && searchResults && searchResults.total > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        value={`search-all-${commandQuery}`}
                        onSelect={() => handleGlobalSearch(commandQuery)}
                        className="px-4 py-2.5 rounded-lg gap-3"
                      >
                        <Search className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                        <span className="text-sm text-muted-foreground">
                          Tutti i risultati per{" "}
                          <span className="font-medium text-foreground">&ldquo;{commandQuery}&rdquo;</span>
                        </span>
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}

                {/* Cerca ovunque anche se nessun risultato */}
                {!isSearching && searchResults && searchResults.total === 0 && (
                  <CommandGroup>
                    <CommandItem
                      value={`search-all-empty-${commandQuery}`}
                      onSelect={() => handleGlobalSearch(commandQuery)}
                      className="px-4 py-2.5 rounded-lg gap-3"
                    >
                      <Search className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                      <span className="text-sm text-muted-foreground">
                        Cerca <span className="font-medium text-foreground">&ldquo;{commandQuery}&rdquo;</span> in tutto il CRM
                      </span>
                    </CommandItem>
                  </CommandGroup>
                )}
              </>
            )}

          </CommandList>
        </Command>
      </CommandDialog>
    </header>
  );
}
