import { getDashboardStats, type DashboardStats } from "@/server/actions/stats";
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

export default async function DashboardPage() {
  let stats: DashboardStats;
  try {
    stats = await getDashboardStats();
  } catch (err) {
    // Rilancia i redirect di Next.js (requireAdmin → /login)
    if (err && typeof err === "object" && "digest" in err &&
        typeof (err as { digest: string }).digest === "string" &&
        (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    logger.error("Errore caricamento dashboard stats", err);
    stats = EMPTY_STATS;
  }
  return (
    <div className="p-4 md:p-6">
      <DashboardClient stats={stats} />
    </div>
  );
}
