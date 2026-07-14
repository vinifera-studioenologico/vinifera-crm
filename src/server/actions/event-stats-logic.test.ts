import { describe, it, expect } from "vitest";
import {
  computeEventStats,
  aggregateStatsByMonth,
  type OrderForStats,
} from "@/server/actions/event-stats-logic";

function makeOrder(overrides: Partial<OrderForStats> = {}): OrderForStats {
  return {
    id: "o1",
    eventId: "ev1",
    eventTitle: "Evento Test",
    eventCapacity: 20,
    status: "paid",
    totalCents: 3000,
    seats: 1,
    priceCents: 3000,
    paidAt: "2026-11-01T12:00:00Z",
    ...overrides,
  };
}

describe("computeEventStats", () => {
  it("paid contribuisce a gross, seatsSold, orderCount", () => {
    const stats = computeEventStats([
      makeOrder({ id: "o1", seats: 2, totalCents: 6000 }),
      makeOrder({ id: "o2", seats: 1, totalCents: 3000 }),
    ]);
    expect(stats[0]!.grossCents).toBe(9000);
    expect(stats[0]!.seatsSold).toBe(3);
    expect(stats[0]!.orderCount).toBe(2);
    expect(stats[0]!.netCents).toBe(9000);
  });

  it("refunded detrae da gross", () => {
    const stats = computeEventStats([
      makeOrder({ id: "o1", status: "paid", totalCents: 6000, seats: 2 }),
      makeOrder({ id: "o2", status: "refunded", totalCents: 6000, seats: 2 }),
    ]);
    expect(stats[0]!.grossCents).toBe(6000);
    expect(stats[0]!.refundedCents).toBe(6000);
    expect(stats[0]!.netCents).toBe(0);
    // refunded non conta su seatsSold/orderCount
    expect(stats[0]!.seatsSold).toBe(2); // solo paid
    expect(stats[0]!.orderCount).toBe(1);
  });

  it("cancelled escluso da tutti i conteggi", () => {
    const stats = computeEventStats([
      makeOrder({ id: "o1", status: "paid", totalCents: 3000 }),
      makeOrder({ id: "o2", status: "cancelled", totalCents: 3000 }),
    ]);
    expect(stats[0]!.orderCount).toBe(1);
    expect(stats[0]!.grossCents).toBe(3000);
    expect(stats[0]!.netCents).toBe(3000);
  });

  it("evento gratuito: avgTicketCents null, netto 0", () => {
    const stats = computeEventStats([
      makeOrder({ id: "o1", totalCents: 0, priceCents: 0, seats: 5 }),
    ]);
    expect(stats[0]!.avgTicketCents).toBeNull();
    expect(stats[0]!.netCents).toBe(0);
    expect(stats[0]!.seatsSold).toBe(5);
    expect(stats[0]!.orderCount).toBe(1);
  });

  it("fillPercent calcolato correttamente", () => {
    const stats = computeEventStats([
      makeOrder({ id: "o1", seats: 10, eventCapacity: 20 }),
    ]);
    expect(stats[0]!.fillPercent).toBe(50);
  });
});

describe("aggregateStatsByMonth", () => {
  it("aggrega per mese da paidAt", () => {
    const orders: OrderForStats[] = [
      makeOrder({ id: "o1", paidAt: "2026-11-01T10:00:00Z", totalCents: 3000, seats: 1 }),
      makeOrder({ id: "o2", paidAt: "2026-11-15T10:00:00Z", totalCents: 3000, seats: 1 }),
      makeOrder({ id: "o3", paidAt: "2026-12-01T10:00:00Z", totalCents: 5000, seats: 2 }),
    ];
    const monthly = aggregateStatsByMonth(orders);
    expect(monthly).toHaveLength(2);
    expect(monthly[0]!.month).toBe("2026-11");
    expect(monthly[0]!.netCents).toBe(6000);
    expect(monthly[0]!.participants).toBe(2);
    expect(monthly[1]!.month).toBe("2026-12");
    expect(monthly[1]!.netCents).toBe(5000);
  });

  it("eventi gratuiti contribuiscono 0 a netCents, contano su partecipanti", () => {
    const orders: OrderForStats[] = [
      makeOrder({ id: "o1", paidAt: "2026-11-01T10:00:00Z", totalCents: 0, seats: 5, priceCents: 0 }),
    ];
    const monthly = aggregateStatsByMonth(orders);
    expect(monthly[0]!.netCents).toBe(0);
    expect(monthly[0]!.participants).toBe(5);
  });

  it("rimborsi deducono netCents nel mese corretto", () => {
    const orders: OrderForStats[] = [
      makeOrder({ id: "o1", status: "paid", paidAt: "2026-11-01T10:00:00Z", totalCents: 6000 }),
      makeOrder({ id: "o2", status: "refunded", paidAt: "2026-11-01T10:00:00Z", totalCents: 6000 }),
    ];
    const monthly = aggregateStatsByMonth(orders);
    expect(monthly[0]!.netCents).toBe(0);
  });

  it("ordini senza paidAt esclusi", () => {
    const orders: OrderForStats[] = [
      makeOrder({ id: "o1", paidAt: null }),
    ];
    expect(aggregateStatsByMonth(orders)).toHaveLength(0);
  });
});
