import Link from "next/link";
import { Users, FlaskConical, FileText, ClipboardList, SearchX, Package, TestTube, Bell, Banknote } from "lucide-react";

import { globalSearch, MAX_HITS_PER_CATEGORY } from "@/lib/search";
import type { ClientHit, SampleHit, QuoteHit, ReportHit, PackageHit, AnalysisHit, ReminderHit, PaymentHit } from "@/lib/search";
import { formatEUR } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";
import { QuoteStatusBadge } from "@/components/widgets/QuoteStatusBadge";
import { SampleStatusBadge } from "@/components/widgets/SampleStatusBadge";
import type { QuoteStatus } from "@/schemas/quote";
import type { SampleStatus } from "@/schemas/sample";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { SearchInput } from "./_components/SearchInput";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ricerca — Vinifera" };

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const results = query.length >= 2 ? await globalSearch(query) : null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Ricerca globale</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Ricerca
        </h1>
        {results && (
          <p className="text-sm text-muted-foreground">
            {results.total === 0
              ? `Nessun risultato per "${query}"`
              : `${results.total} risultat${results.total === 1 ? "o" : "i"} per "${query}"`}
          </p>
        )}
      </div>

      {/* Search input */}
      <SearchInput defaultValue={query} />

      {/* Prompt iniziale */}
      {!results && (
        <div className="rounded-xl border border-border bg-card p-16 flex flex-col items-center gap-3 text-center">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center">
            <FlaskConical className="size-5 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-foreground">Inizia a digitare</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Cerca tra clienti, campioni, preventivi e referti. Minimo 2 caratteri.
          </p>
        </div>
      )}

      {/* Nessun risultato */}
      {results && results.total === 0 && (
        <div className="rounded-xl border border-border bg-card p-16 flex flex-col items-center gap-3 text-center">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center">
            <SearchX className="size-5 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-foreground">Nessun risultato</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Prova con un termine diverso o controlla l&apos;ortografia.
          </p>
        </div>
      )}

      {/* Risultati */}
      {results && results.total > 0 && (
        <div className="space-y-6">
          <ClientsSection hits={results.clients} query={query} />
          <SamplesSection hits={results.samples} query={query} />
          <QuotesSection hits={results.quotes} query={query} />
          <ReportsSection hits={results.reports} query={query} />
          <PackagesSection hits={results.packages} query={query} />
          <AnalysesSection hits={results.analyses} query={query} />
          <RemindersSection hits={results.reminders} query={query} />
          <PaymentsSection hits={results.payments} query={query} />
        </div>
      )}
    </div>
  );
}

// ── Section: Clienti ──────────────────────────────────────────────────

function ClientsSection({ hits, query }: { hits: ClientHit[]; query: string }) {
  if (hits.length === 0) return null;
  return (
    <section>
      <SectionHeader
        icon={<Users className="size-4" strokeWidth={1.75} />}
        label="Clienti"
        count={hits.length}
        capped={hits.length >= MAX_HITS_PER_CATEGORY}
        href={`/clients`}
      />
      <ul className="mt-2 divide-y divide-border rounded-xl border border-border overflow-hidden">
        {hits.map((hit) => (
          <li key={hit.id}>
            <Link
              href={`/clients/${hit.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 bg-card hover:bg-muted/50 transition-colors group"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                  <Highlight text={hit.displayName} query={query} />
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  <Highlight text={hit.email} query={query} />
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground capitalize">
                {hit.type === "business" ? "Azienda" : "Privato"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Section: Campioni ─────────────────────────────────────────────────

function SamplesSection({ hits, query }: { hits: SampleHit[]; query: string }) {
  if (hits.length === 0) return null;
  return (
    <section>
      <SectionHeader
        icon={<FlaskConical className="size-4" strokeWidth={1.75} />}
        label="Campioni"
        count={hits.length}
        capped={hits.length >= MAX_HITS_PER_CATEGORY}
        href="/samples"
      />
      <ul className="mt-2 divide-y divide-border rounded-xl border border-border overflow-hidden">
        {hits.map((hit) => (
          <li key={hit.id}>
            <Link
              href={`/samples/${hit.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 bg-card hover:bg-muted/50 transition-colors group"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium font-mono text-foreground group-hover:text-primary transition-colors">
                  <Highlight text={hit.code} query={query} />
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  <Highlight text={hit.sampleName} query={query} />
                  {hit.clientName && (
                    <> · <Highlight text={hit.clientName} query={query} /></>
                  )}
                </p>
              </div>
              <SampleStatusBadge status={hit.status as SampleStatus} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Section: Preventivi ───────────────────────────────────────────────

function QuotesSection({ hits, query }: { hits: QuoteHit[]; query: string }) {
  if (hits.length === 0) return null;
  return (
    <section>
      <SectionHeader
        icon={<FileText className="size-4" strokeWidth={1.75} />}
        label="Preventivi"
        count={hits.length}
        capped={hits.length >= MAX_HITS_PER_CATEGORY}
        href="/quotes"
      />
      <ul className="mt-2 divide-y divide-border rounded-xl border border-border overflow-hidden">
        {hits.map((hit) => (
          <li key={hit.id}>
            <Link
              href={`/quotes/${hit.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 bg-card hover:bg-muted/50 transition-colors group"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium font-mono text-foreground group-hover:text-primary transition-colors">
                  <Highlight text={hit.number} query={query} />
                </p>
                {hit.clientName && (
                  <p className="text-xs text-muted-foreground truncate">
                    <Highlight text={hit.clientName} query={query} />
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm tabular-nums text-foreground font-medium">
                  {formatEUR(hit.totalCents)}
                </span>
                <QuoteStatusBadge status={hit.status as QuoteStatus} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Section: Referti ──────────────────────────────────────────────────

function ReportsSection({ hits, query }: { hits: ReportHit[]; query: string }) {
  if (hits.length === 0) return null;
  return (
    <section>
      <SectionHeader
        icon={<ClipboardList className="size-4" strokeWidth={1.75} />}
        label="Referti"
        count={hits.length}
        capped={hits.length >= MAX_HITS_PER_CATEGORY}
        href="/reports"
      />
      <ul className="mt-2 divide-y divide-border rounded-xl border border-border overflow-hidden">
        {hits.map((hit) => (
          <li key={hit.id}>
            <Link
              href={`/reports/${hit.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 bg-card hover:bg-muted/50 transition-colors group"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium font-mono text-foreground group-hover:text-primary transition-colors">
                  <Highlight text={hit.number} query={query} />
                </p>
                {hit.clientName && (
                  <p className="text-xs text-muted-foreground truncate">
                    <Highlight text={hit.clientName} query={query} />
                  </p>
                )}
              </div>
              {hit.generatedAt && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDate(hit.generatedAt)}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Section: Pacchetti ────────────────────────────────────────────────

function PackagesSection({ hits, query }: { hits: PackageHit[]; query: string }) {
  if (hits.length === 0) return null;
  return (
    <section>
      <SectionHeader
        icon={<Package className="size-4" strokeWidth={1.75} />}
        label="Pacchetti"
        count={hits.length}
        capped={hits.length >= MAX_HITS_PER_CATEGORY}
        href="/packages"
      />
      <ul className="mt-2 divide-y divide-border rounded-xl border border-border overflow-hidden">
        {hits.map((hit) => (
          <li key={hit.id}>
            <Link
              href="/packages"
              className="flex items-center justify-between gap-4 px-4 py-3 bg-card hover:bg-muted/50 transition-colors group"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                  <Highlight text={hit.name} query={query} />
                </p>
                {hit.description && (
                  <p className="text-xs text-muted-foreground truncate">
                    <Highlight text={hit.description} query={query} />
                  </p>
                )}
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {formatEUR(hit.priceCents)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Section: Analisi ──────────────────────────────────────────────────

function AnalysesSection({ hits, query }: { hits: AnalysisHit[]; query: string }) {
  if (hits.length === 0) return null;
  return (
    <section>
      <SectionHeader
        icon={<TestTube className="size-4" strokeWidth={1.75} />}
        label="Analisi"
        count={hits.length}
        capped={hits.length >= MAX_HITS_PER_CATEGORY}
        href="/analyses"
      />
      <ul className="mt-2 divide-y divide-border rounded-xl border border-border overflow-hidden">
        {hits.map((hit) => (
          <li key={hit.id}>
            <Link
              href="/analyses"
              className="flex items-center justify-between gap-4 px-4 py-3 bg-card hover:bg-muted/50 transition-colors group"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium font-mono text-foreground group-hover:text-primary transition-colors">
                  <Highlight text={hit.code} query={query} />
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  <Highlight text={hit.name} query={query} />
                  {hit.category && (
                    <> · <Highlight text={hit.category} query={query} /></>
                  )}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Section: Promemoria ───────────────────────────────────────────────

const REMINDER_STATUS_LABELS: Record<string, string> = {
  pending: "In attesa",
  done: "Completato",
  snoozed: "Posticipato",
  cancelled: "Annullato",
};

function RemindersSection({ hits, query }: { hits: ReminderHit[]; query: string }) {
  if (hits.length === 0) return null;
  return (
    <section>
      <SectionHeader
        icon={<Bell className="size-4" strokeWidth={1.75} />}
        label="Promemoria"
        count={hits.length}
        capped={hits.length >= MAX_HITS_PER_CATEGORY}
        href="/reminders"
      />
      <ul className="mt-2 divide-y divide-border rounded-xl border border-border overflow-hidden">
        {hits.map((hit) => (
          <li key={hit.id}>
            <Link
              href="/reminders"
              className="flex items-center justify-between gap-4 px-4 py-3 bg-card hover:bg-muted/50 transition-colors group"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                  <Highlight text={hit.title} query={query} />
                </p>
                {hit.description && (
                  <p className="text-xs text-muted-foreground truncate">
                    <Highlight text={hit.description} query={query} />
                  </p>
                )}
              </div>
              <div className="shrink-0 flex flex-col items-end gap-0.5">
                <span className="text-xs text-muted-foreground">
                  {REMINDER_STATUS_LABELS[hit.status] ?? hit.status}
                </span>
                {hit.dueAt && (
                  <span className="text-xs text-muted-foreground">
                    {formatDate(hit.dueAt)}
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Section: Pagamenti ────────────────────────────────────────────────

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "In attesa",
  partial: "Parziale",
  paid: "Pagato",
  overdue: "Scaduto",
  cancelled: "Annullato",
};

function PaymentsSection({ hits, query }: { hits: PaymentHit[]; query: string }) {
  if (hits.length === 0) return null;
  return (
    <section>
      <SectionHeader
        icon={<Banknote className="size-4" strokeWidth={1.75} />}
        label="Pagamenti"
        count={hits.length}
        capped={hits.length >= MAX_HITS_PER_CATEGORY}
        href="/payments"
      />
      <ul className="mt-2 divide-y divide-border rounded-xl border border-border overflow-hidden">
        {hits.map((hit) => (
          <li key={hit.id}>
            <Link
              href="/payments"
              className="flex items-center justify-between gap-4 px-4 py-3 bg-card hover:bg-muted/50 transition-colors group"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                  <Highlight text={hit.description} query={query} />
                </p>
                <p className="text-xs text-muted-foreground">
                  {PAYMENT_STATUS_LABELS[hit.status] ?? hit.status}
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {formatEUR(hit.totalAmountCents)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Shared components ─────────────────────────────────────────────────
function SectionHeader({
  icon,
  label,
  count,
  capped,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  capped: boolean;
  href: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
        <span className="text-xs text-muted-foreground">
          {capped ? `${count}+` : count}
        </span>
      </div>
      {capped && (
        <Link
          href={href}
          className="text-xs text-primary hover:underline underline-offset-2"
        >
          Vedi tutti →
        </Link>
      )}
    </div>
  );
}

/**
 * Evidenzia le occorrenze del termine di ricerca nel testo.
 * Restituisce testo con le parti corrispondenti in grassetto.
 */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);

  if (idx === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/15 text-foreground rounded-sm px-0.5 font-semibold not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
