import type { Metadata } from "next";
import Link from "next/link";
import {
  FlaskConical,
  FileText,
  BarChart2,
  Package,
  Bell,
  CreditCard,
  ArrowRight,
  CheckCircle2,
  TestTube,
  ClipboardList,
  Users,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Vinifera — Gestionale per laboratori enologici",
  description:
    "Il CRM pensato per i laboratori di analisi del vino. Gestisci clienti, campioni, analisi, referti e pagamenti in un'unica piattaforma ottimizzata per iPad.",
  openGraph: {
    title: "Vinifera — Gestionale per laboratori enologici",
    description:
      "Gestisci clienti, campioni, analisi, referti e pagamenti in un'unica piattaforma.",
    type: "website",
    locale: "it_IT",
  },
};

const FEATURES = [
  {
    icon: Users,
    title: "Gestione clienti",
    description:
      "Schede complete con storico analisi, pagamenti, pacchetti e promemoria per ogni cliente.",
  },
  {
    icon: TestTube,
    title: "Campioni e analisi",
    description:
      "Wizard di inserimento, tracciamento stato e inserimento risultati direttamente dal laboratorio.",
  },
  {
    icon: ClipboardList,
    title: "Referti PDF",
    description:
      "Genera referti professionali in un click e inviali via email al cliente con Resend.",
  },
  {
    icon: FileText,
    title: "Preventivi",
    description:
      "Crea preventivi con voci dettagliate, sconti e tasse, esportabili in PDF con un tocco.",
  },
  {
    icon: Package,
    title: "Pacchetti analisi",
    description:
      "Definisci pacchetti prepagati: le analisi scalano automaticamente al ricevimento campioni.",
  },
  {
    icon: CreditCard,
    title: "Pagamenti e rate",
    description:
      "Gestisci pagamenti rateali, segna gli incassi e monitora i saldi in tempo reale.",
  },
  {
    icon: Bell,
    title: "Promemoria automatici",
    description:
      "Configura notifiche via Telegram o email per non dimenticare scadenze e follow-up.",
  },
  {
    icon: BarChart2,
    title: "Dashboard & statistiche",
    description:
      "KPI in tempo reale, grafici mensili di fatturato e tasso di completamento campioni.",
  },
] as const;

const HIGHLIGHTS = [
  "Ottimizzato per iPad e touch",
  "Dark mode nativa",
  "PDF generati lato server",
  "Notifiche Telegram + Email",
  "Dati al sicuro su Firebase",
  "Accesso protetto da autenticazione",
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Nav ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="size-5 text-primary" strokeWidth={1.75} />
            <span className="font-semibold tracking-tight">Vinifera</span>
          </div>
          <Link href="/login">
            <Button size="sm" variant="outline" className="text-xs">
              Accedi
              <ArrowRight className="size-3.5" strokeWidth={1.75} />
            </Button>
          </Link>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-20 pb-16 text-center space-y-6 md:pt-28 md:pb-24">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
          <Star className="size-3" strokeWidth={1.75} />
          Gestionale per laboratori enologici
        </div>

        <h1 className="text-4xl font-bold tracking-tight leading-tight md:text-5xl lg:text-6xl">
          Il tuo laboratorio,{" "}
          <span className="text-primary">senza carta</span>
        </h1>

        <p className="mx-auto max-w-xl text-base text-muted-foreground md:text-lg">
          Vinifera è il CRM progettato per i laboratori di analisi enologiche.
          Clienti, campioni, analisi, referti e pagamenti — tutto in un&apos;unica
          piattaforma ottimizzata per iPad.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link href="/login">
            <Button size="lg" className="w-full sm:w-auto gap-2">
              Inizia subito
              <ArrowRight className="size-4" strokeWidth={1.75} />
            </Button>
          </Link>
          <Link href="#funzionalita">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Scopri le funzionalità
            </Button>
          </Link>
        </div>
      </section>

      {/* ── Mock preview ────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
          {/* Fake browser chrome */}
          <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-muted/40">
            <div className="size-2.5 rounded-full bg-red-400/80" />
            <div className="size-2.5 rounded-full bg-amber-400/80" />
            <div className="size-2.5 rounded-full bg-emerald-400/80" />
            <div className="flex-1 mx-4 h-5 rounded bg-muted text-[10px] text-muted-foreground flex items-center px-2">
              app.vinifera.it/dashboard
            </div>
          </div>
          {/* Fake dashboard preview */}
          <div className="p-6 space-y-4 bg-background min-h-52">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {["€ 12.480", "€ 8.200", "4 campioni", "3 preventivi"].map(
                (v, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border bg-card p-3 space-y-1"
                  >
                    <div className="h-2.5 w-16 rounded bg-muted" />
                    <p className="text-base font-semibold tabular-nums">{v}</p>
                    <div className="h-2 w-20 rounded bg-muted/60" />
                  </div>
                ),
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {["Ultimi campioni", "Promemoria"].map((label) => (
                <div
                  key={label}
                  className="rounded-lg border border-border bg-card p-4 space-y-2.5"
                >
                  <div className="h-3 w-28 rounded bg-muted" />
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="size-6 rounded-full bg-primary/10 shrink-0" />
                      <div className="flex-1 space-y-1">
                        <div className="h-2.5 w-3/4 rounded bg-muted" />
                        <div className="h-2 w-1/2 rounded bg-muted/60" />
                      </div>
                      <div className="h-4 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 shrink-0" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────── */}
      <section
        id="funzionalita"
        className="mx-auto max-w-6xl px-4 py-16 space-y-10"
      >
        <div className="text-center space-y-3">
          <h2 className="text-3xl font-bold tracking-tight">
            Tutto ciò di cui hai bisogno
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Ogni funzionalità è progettata per il flusso di lavoro reale di un
            laboratorio enologico.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-xl border border-border bg-card p-5 space-y-3 hover:border-primary/40 transition-colors"
            >
              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="size-4 text-primary" strokeWidth={1.75} />
              </div>
              <h3 className="font-semibold text-sm">{title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Highlights ──────────────────────────────────────────── */}
      <section className="bg-primary/5 border-y border-primary/10">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {HIGHLIGHTS.map((h) => (
              <div key={h} className="flex items-center gap-2">
                <CheckCircle2
                  className="size-3.5 text-primary shrink-0"
                  strokeWidth={2}
                />
                <span className="text-xs font-medium">{h}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center space-y-6">
        <h2 className="text-3xl font-bold tracking-tight">
          Pronto per iniziare?
        </h2>
        <p className="text-muted-foreground max-w-sm mx-auto">
          Accedi al gestionale e trasforma il modo in cui gestisci il tuo
          laboratorio.
        </p>
        <Link href="/login">
          <Button size="lg" className="gap-2">
            Accedi a Vinifera
            <ArrowRight className="size-4" strokeWidth={1.75} />
          </Button>
        </Link>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <FlaskConical className="size-3.5 text-primary" strokeWidth={1.75} />
            <span className="font-medium text-foreground">Vinifera</span>
            <span>— Gestionale per laboratori enologici</span>
          </div>
          <p>© {new Date().getFullYear()} Tutti i diritti riservati</p>
        </div>
      </footer>
    </div>
  );
}
