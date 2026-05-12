import { getMonthlyStats, getSamplesByMonth } from "@/server/actions/stats";
import { StatsClient } from "./_components/StatsClient";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const currentYear = new Date().getFullYear();

  const [revenue, samplesByMonth] = await Promise.all([
    getMonthlyStats(currentYear),
    getSamplesByMonth(),
  ]);

  return (
    <div className="p-4 md:p-6">
      <StatsClient
        initialRevenue={revenue}
        samplesByMonth={samplesByMonth}
        currentYear={currentYear}
      />
    </div>
  );
}
