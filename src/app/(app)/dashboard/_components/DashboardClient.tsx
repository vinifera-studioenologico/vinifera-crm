"use client";

import Link from "next/link";
import {
  Euro,
  Clock,
  AlertTriangle,
  TestTube,
  FileText,
  Package,
  Users,
  Bell,
  ChevronRight,
} from "lucide-react";

import type { DashboardStats } from "@/server/actions/stats";
import type { SampleDoc } from "@/schemas/sample";
import type { ReminderDoc } from "@/schemas/reminder";

import { KpiCard } from "@/components/widgets/KpiCard";
import { SampleStatusBadge } from "@/components/widgets/SampleStatusBadge";
import { formatEUR } from "@/lib/utils/money";
import { cn } from "@/lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

// ── Formatta dueAt ────────────────────────────────────────────────────
function formatDueAt(ts: unknown): string {
  if (!ts) return "—";
  const d =
    typeof ts === "object" && ts !== null && "toDate" in ts
      ? (ts as { toDate: () => Date }).toDate()
      : new Date(ts as string);
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isOverdue(ts: unknown): boolean {
  if (!ts) return false;
  const d =
    typeof ts === "object" && ts !== null && "toDate" in ts
      ? (ts as { toDate: () => Date }).toDate()
      : new Date(ts as string);
  return d < new Date();
}

// ── Card campione recente ─────────────────────────────────────────────
function RecentSampleRow({ sample }: { sample: SampleDoc }) {
  return (
    <Link
      href={`/samples/${sample.id}`}
      className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60 transition-colors group"
    >
      <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <TestTube className="size-3.5 text-primary" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{sample.sampleName}</p>
        <p className="text-xs text-muted-foreground truncate">
          {sample.code} · {sample.clientNameSnapshot}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <SampleStatusBadge status={sample.status} />
        <ChevronRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}

// ── Card promemoria ───────────────────────────────────────────────────
function ReminderRow({ reminder }: { reminder: ReminderDoc }) {
  const overdue = isOverdue(reminder.dueAt);
  return (
    <Link
      href="/reminders"
      className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60 transition-colors group"
    >
      <div
        className={cn(
          "size-8 rounded-full flex items-center justify-center shrink-0",
          overdue ? "bg-red-100 dark:bg-red-900/30" : "bg-amber-100 dark:bg-amber-900/30",
        )}
      >
        <Bell
          className={cn(
            "size-3.5",
            overdue ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400",
          )}
          strokeWidth={1.75}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{reminder.title}</p>
        <p
          className={cn(
            "text-xs",
            overdue ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
          )}
        >
          {overdue ? "Scaduto · " : ""}
          {formatDueAt(reminder.dueAt)}
        </p>
      </div>
      <ChevronRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  );
}

// ── Componente principale ─────────────────────────────────────────────
interface Props {
  stats: DashboardStats;
}

export function DashboardClient({ stats }: Props) {
  const {
    incassiMeseCents,
    incassiFuturiCents,
    scadutoCents,
    campioniAttivi,
    preventiviInAttesa,
    pacchetttiAttivi,
    clientiTotali,
    recentSamples,
    upcomingReminders,
  } = stats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Dashboard</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">Panoramica attività del laboratorio</p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Incassi mese"
          icon={Euro}
          value={formatEUR(incassiMeseCents)}
          description="entrate registrate nel mese"
        />
        <KpiCard
          title="Attesi 90 gg"
          icon={Clock}
          value={formatEUR(incassiFuturiCents)}
          description="rate pending nei prossimi 3 mesi"
        />
        <KpiCard
          title="In ritardo"
          icon={AlertTriangle}
          value={formatEUR(scadutoCents)}
          description="rate scadute non pagate"
          className={scadutoCents > 0 ? "border-red-200 dark:border-red-900" : ""}
        />
        <KpiCard
          title="Clienti attivi"
          icon={Users}
          value={String(clientiTotali)}
          description="clienti in rubrica"
        />
        <KpiCard
          title="Campioni attivi"
          icon={TestTube}
          value={String(campioniAttivi)}
          description="in attesa + in lavorazione"
        />
        <KpiCard
          title="Preventivi inviati"
          icon={FileText}
          value={String(preventiviInAttesa)}
          description="in attesa di risposta"
        />
        <KpiCard
          title="Pacchetti attivi"
          icon={Package}
          value={String(pacchetttiAttivi)}
          description="abbonamenti in corso"
        />
        <Link href="/stats">
          <KpiCard
            title="Statistiche"
            icon={Euro}
            value="→ Vedi grafici"
            description="andamento mensile dettagliato"
            className="cursor-pointer hover:border-primary/40 transition-colors"
          />
        </Link>
      </div>

      {/* Sezioni recenti */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Ultimi campioni */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Ultimi campioni</h2>
            <Link
              href="/samples"
              className="text-xs text-primary hover:underline"
            >
              Vedi tutti
            </Link>
          </div>
          {recentSamples.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Nessun campione ancora registrato.
            </p>
          ) : (
            recentSamples.map((s) => <RecentSampleRow key={s.id} sample={s} />)
          )}
        </section>

        {/* Prossimi promemoria */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Prossimi promemoria</h2>
            <Link
              href="/reminders"
              className="text-xs text-primary hover:underline"
            >
              Vedi tutti
            </Link>
          </div>
          {upcomingReminders.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Nessun promemoria attivo.
            </p>
          ) : (
            upcomingReminders.map((r) => (
              <ReminderRow key={r.id} reminder={r} />
            ))
          )}
        </section>
      </div>
    </div>
  );
}
