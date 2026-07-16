/**
 * Logica pura per le statistiche entrate eventi.
 * Nessuna dipendenza da Firestore — testabile con Vitest.
 */

export interface OrderForStats {
  id: string;
  eventId: string;
  eventTitle: string;
  eventCapacity: number;
  status: "paid" | "refunded" | "cancelled" | "expired" | "failed" | "pending_payment";
  totalCents: number;
  seats: number;
  priceCents: number; // unitPriceCents
  paidAt: string | null; // ISO
}

export interface EventStatsSummary {
  eventId: string;
  eventTitle: string;
  capacity: number;
  grossCents: number;
  refundedCents: number;
  netCents: number;
  seatsSold: number;
  fillPercent: number;
  orderCount: number;
  avgTicketCents: number | null; // null per eventi gratuiti
}

export interface MonthlyStatEntry {
  month: string; // "YYYY-MM"
  netCents: number;
  orderCount: number;
  participants: number;
}

/**
 * Calcola le statistiche per ogni evento.
 * - paid: contribuisce a gross + seatsSold + orderCount
 * - refunded: detraggono dal gross (refundedCents), non contano su seats/orders
 * - cancelled: esclusi (come refunded)
 */
export function computeEventStats(orders: OrderForStats[]): EventStatsSummary[] {
  const byEvent = new Map<string, { title: string; capacity: number; orders: OrderForStats[] }>();

  for (const order of orders) {
    if (!byEvent.has(order.eventId)) {
      byEvent.set(order.eventId, { title: order.eventTitle, capacity: order.eventCapacity, orders: [] });
    }
    byEvent.get(order.eventId)!.orders.push(order);
  }

  const result: EventStatsSummary[] = [];

  for (const [eventId, { title, capacity, orders: evOrders }] of byEvent.entries()) {
    const paid = evOrders.filter((o) => o.status === "paid");
    const refunded = evOrders.filter((o) => o.status === "refunded");

    const grossCents = paid.reduce((s, o) => s + o.totalCents, 0);
    const refundedCents = refunded.reduce((s, o) => s + o.totalCents, 0);
    const netCents = grossCents - refundedCents;

    const seatsSold = paid.reduce((s, o) => s + o.seats, 0);
    const orderCount = paid.length;
    const fillPercent = capacity > 0 ? Math.round((seatsSold / capacity) * 100) : 0;

    // Ticket medio: null se tutti gli ordini paid hanno totalCents === 0 (gratuiti)
    const avgTicketCents =
      orderCount > 0 && grossCents > 0
        ? Math.round(grossCents / orderCount)
        : null;

    result.push({
      eventId,
      eventTitle: title,
      capacity,
      grossCents,
      refundedCents,
      netCents,
      seatsSold,
      fillPercent,
      orderCount,
      avgTicketCents,
    });
  }

  return result;
}

/**
 * Aggrega le statistiche per mese (da `paidAt` degli ordini paid).
 * I gratuiti (totalCents === 0) contribuiscono 0 a netCents ma contano
 * su orderCount e participants.
 */
export function aggregateStatsByMonth(orders: OrderForStats[]): MonthlyStatEntry[] {
  const byMonth = new Map<string, MonthlyStatEntry>();

  for (const order of orders) {
    if (order.status !== "paid" || !order.paidAt) continue;

    const month = order.paidAt.slice(0, 7); // "YYYY-MM"
    if (!byMonth.has(month)) {
      byMonth.set(month, { month, netCents: 0, orderCount: 0, participants: 0 });
    }
    const entry = byMonth.get(month)!;
    entry.netCents += order.totalCents;
    entry.orderCount++;
    entry.participants += order.seats;
  }

  // Deduci i rimborsi nel mese del pagamento originale
  for (const order of orders) {
    if (order.status !== "refunded" || !order.paidAt) continue;
    const month = order.paidAt.slice(0, 7);
    const entry = byMonth.get(month);
    if (entry) entry.netCents -= order.totalCents;
  }

  return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
}
