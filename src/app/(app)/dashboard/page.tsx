import { getDashboardStats, type DashboardStats } from "@/server/actions/stats";
import { getGoalProgress, type GoalProgress } from "@/server/actions/goals";
import { DashboardClient } from "./_components/DashboardClient";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const EMPTY_STATS: DashboardStats = {
  incassiMeseCents: 0,
  incassiFuturiCents: 0,
  scadutoCents: 0,
  campioniAttivi: 0,
  preventiviInAttesa: 0,
  pacchetttiAttivi: 0,
  clientiTotali: 0,
  recentSamples: [],
  upcomingReminders: [],
};

function isNextRedirect(err: unknown): boolean {
  return (
    !!err && typeof err === "object" && "digest" in err &&
    typeof (err as { digest: string }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export default async function DashboardPage() {
  const currentYear = new Date().getFullYear();

  // Le due chiamate sono indipendenti (fonti e fallback diversi): eseguite in
  // parallelo invece che in sequenza, il tempo di caricamento della pagina è
  // il massimo delle due, non la somma.
  const [statsResult, goalProgressResult] = await Promise.allSettled([
    getDashboardStats(),
    getGoalProgress(currentYear),
  ]);

  let stats: DashboardStats;
  if (statsResult.status === "fulfilled") {
    stats = statsResult.value;
  } else {
    // Rilancia i redirect di Next.js (requireAdmin → /login)
    if (isNextRedirect(statsResult.reason)) throw statsResult.reason;
    logger.error("Errore caricamento dashboard stats", statsResult.reason);
    stats = EMPTY_STATS;
  }

  // Caricato separatamente da DashboardStats (che ha il suo EMPTY_STATS): un
  // errore sugli obiettivi non deve far cadere il resto della dashboard.
  let goalProgress: GoalProgress | null = null;
  if (goalProgressResult.status === "fulfilled") {
    goalProgress = goalProgressResult.value;
  } else {
    if (isNextRedirect(goalProgressResult.reason)) throw goalProgressResult.reason;
    logger.error("Errore caricamento obiettivi dashboard", goalProgressResult.reason);
  }

  return (
    <div className="p-4 md:p-6">
      <DashboardClient stats={stats} goalProgress={goalProgress} currentYear={currentYear} />
    </div>
  );
}
