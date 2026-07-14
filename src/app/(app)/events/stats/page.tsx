import { getEventsRevenueStats } from "@/server/actions/eventOrders";
import { StatsClient } from "./_components/StatsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard entrate eventi — Vinifera" };

export default async function EventsStatsPage() {
  const stats = await getEventsRevenueStats({ year: new Date().getFullYear() });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard entrate eventi</h1>
        <p className="text-sm text-muted-foreground mt-1">Anno {stats.year}</p>
      </div>
      <StatsClient
        byEvent={stats.byEvent}
        byMonth={stats.byMonth}
        totals={stats.totals}
        year={stats.year}
      />
    </div>
  );
}
