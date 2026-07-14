import { getEventOrders } from "@/server/actions/eventOrders";
import { computeEventStats } from "@/server/actions/event-stats-logic";
import { formatEUR } from "@/lib/utils/money";
import { tsToISO } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata = { title: "Statistiche evento — Vinifera" };

export default async function EventStatsPage({ params }: Props) {
  const { id } = await params;
  const orders = await getEventOrders(id);

  // Converti in formato per computeEventStats
  const statsOrders = orders.map((o) => ({
    id: o.id,
    eventId: o.eventId,
    eventTitle: "",
    eventCapacity: 0,
    status: o.status as "paid" | "refunded" | "cancelled",
    totalCents: o.totalCents,
    seats: o.seats,
    priceCents: o.unitPriceCents,
    paidAt: o.paidAt,
  })).filter((o) => ["paid", "refunded", "cancelled"].includes(o.status));

  const statsArr = computeEventStats(statsOrders);
  const stats = statsArr[0];

  if (!stats) {
    return (
      <div className="p-4 md:p-6 text-center text-muted-foreground text-sm">
        Nessun ordine registrato per questo evento.
      </div>
    );
  }

  const metrics = [
    { label: "Lordo incassato", value: formatEUR(stats.grossCents) },
    { label: "Rimborsato", value: stats.refundedCents > 0 ? `- ${formatEUR(stats.refundedCents)}` : "—" },
    { label: "Netto", value: formatEUR(stats.netCents) },
    { label: "Posti venduti", value: `${stats.seatsSold} / ${stats.capacity} (${stats.fillPercent}%)` },
    { label: "N° ordini", value: String(stats.orderCount) },
    { label: "Ticket medio", value: stats.avgTicketCents !== null ? formatEUR(stats.avgTicketCents) : "—" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h2 className="text-lg font-semibold">Statistiche</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-xl bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground mb-1">{m.label}</p>
            <p className="font-semibold tabular-nums">{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
