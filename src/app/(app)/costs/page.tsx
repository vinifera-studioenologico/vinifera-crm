import { format } from "date-fns";
import { it } from "date-fns/locale";
import { logger } from "@/lib/logger";
import { getCostsSummary, getExpenses, getSuggestedPricing } from "@/server/actions/costs";
import { CostsDashboardClient } from "./_components/CostsDashboardClient";
import type { CostsSummary } from "@/server/actions/costs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Costi & Marginalità — Vinifera" };

const EMPTY_SUMMARY: CostsSummary = {
  totalExpensesCents: 0,
  kitPurchasesCents: 0,
  overheadExpensesCents: 0,
  totalFixedMonthlyCents: 0,
  totalMonthlyCents: 0,
  estimatedCostPerAnalysisCents: 0,
  overheadPerAnalysisCents: 0,
  averageSellingPriceCents: 0,
  marginPercent: 0,
  kitsCount: 0,
  avgCostPerTestCents: 0,
};

export default async function CostsDashboardPage() {
  const now = new Date();
  const monthLabel = format(now, "MMMM yyyy", { locale: it });

  let summary = EMPTY_SUMMARY;
  let recentExpenses: Awaited<ReturnType<typeof getExpenses>> = [];
  let belowCostCount = 0;

  try {
    [summary, recentExpenses] = await Promise.all([
      getCostsSummary(),
      getExpenses(),
    ]);
    recentExpenses = recentExpenses.slice(0, 5);

    const pricing = await getSuggestedPricing();
    belowCostCount = pricing.filter((p) => p.belowCost).length;
  } catch (err) {
    // Rilancia redirect Next.js (requireAdmin → /login)
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: string }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    logger.error("Errore caricamento dashboard costi", err);
  }

  const formattedMonth =
    monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  return (
    <CostsDashboardClient
      summary={summary}
      recentExpenses={recentExpenses}
      belowCostCount={belowCostCount}
      monthLabel={formattedMonth}
    />
  );
}
