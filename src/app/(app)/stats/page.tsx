import {
  getMonthlyStats,
  getSamplesByMonth,
  getExpensesByCategoryMonthly,
  getIncomeByMethod,
} from "@/server/actions/stats";
import { StatsClient } from "./_components/StatsClient";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const currentYear = new Date().getFullYear();

  const [revenue, samplesByMonth, expensesByCategory, incomeByMethod] = await Promise.all([
    getMonthlyStats(currentYear),
    getSamplesByMonth(),
    getExpensesByCategoryMonthly(currentYear),
    getIncomeByMethod(currentYear),
  ]);

  return (
    <div className="p-4 md:p-6">
      <StatsClient
        initialRevenue={revenue}
        samplesByMonth={samplesByMonth}
        expensesByCategory={expensesByCategory}
        incomeByMethod={incomeByMethod}
        currentYear={currentYear}
      />
    </div>
  );
}
