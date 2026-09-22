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

  let stats: DashboardStats;
  try {
    stats = await getDashboardStats();
  } catch (err) {
    // Rilancia i redirect di Next.js (requireAdmin → /login)
    if (isNextRedirect(err)) throw err;
    logger.error("Errore caricamento dashboard stats", err);
    stats = EMPTY_STATS;
  }

  // Caricato separatamente da DashboardStats (che ha il suo EMPTY_STATS): un
  // errore sugli obiettivi non deve far cadere il resto della dashboard.
  let goalProgress: GoalProgress | null = null;
  try {
    goalProgress = await getGoalProgress(currentYear);
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    logger.error("Errore caricamento obiettivi dashboard", err);
  }

  return (
    <div className="p-4 md:p-6">
      <DashboardClient stats={stats} goalProgress={goalProgress} currentYear={currentYear} />
    </div>
  );
}
