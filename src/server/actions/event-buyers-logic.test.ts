import { describe, it, expect } from "vitest";
import {
  groupOrdersByBuyer,
  type OrderForHistory,
} from "@/server/actions/event-buyers-logic";

function makeOrder(overrides: Partial<OrderForHistory> = {}): OrderForHistory {
  return {
    id: "o1",
    status: "paid",
    eventId: "ev1",
    eventTitleIt: "Evento Test",
    seats: 2,
    totalCents: 6000,
    paidAt: null,
    createdAt: null,
    buyer: {
      firstName: "Mario",
      lastName: "Rossi",
      emailNormalized: "mario@test.it",
      phoneNormalized: "3331234567",
    },
    historyConsent: { granted: true },
    ...overrides,
  };
}

describe("groupOrdersByBuyer", () => {
  it("ordini senza consenso → esclusi", () => {
    const orders = [makeOrder({ historyConsent: { granted: false } })];
    expect(groupOrdersByBuyer(orders)).toHaveLength(0);
  });

  it("unico acquirente → un gruppo", () => {
    const orders = [makeOrder({ id: "o1" }), makeOrder({ id: "o2" })];
    // stessa email → stesso gruppo
    expect(groupOrdersByBuyer(orders)).toHaveLength(1);
  });

  it("match per email: due ordini stessa email → un gruppo", () => {
    const orders = [
      makeOrder({ id: "o1", buyer: { firstName: "A", lastName: "X", emailNormalized: "a@test.it", phoneNormalized: "111" } }),
      makeOrder({ id: "o2", buyer: { firstName: "A", lastName: "X", emailNormalized: "a@test.it", phoneNormalized: "999" } }),
    ];
    expect(groupOrdersByBuyer(orders)).toHaveLength(1);
  });

  it("match per telefono: due ordini stesso telefono → un gruppo", () => {
    const orders = [
      makeOrder({ id: "o1", buyer: { firstName: "A", lastName: "X", emailNormalized: "a@test.it", phoneNormalized: "333111" } }),
      makeOrder({ id: "o2", buyer: { firstName: "B", lastName: "Y", emailNormalized: "b@test.it", phoneNormalized: "333111" } }),
    ];
    expect(groupOrdersByBuyer(orders)).toHaveLength(1);
  });

  it("match transitivo: A-B via email, B-C via telefono → un gruppo", () => {
    const orders = [
      makeOrder({ id: "o1", buyer: { firstName: "A", lastName: "X", emailNormalized: "a@test.it", phoneNormalized: "111" } }),
      makeOrder({ id: "o2", buyer: { firstName: "B", lastName: "Y", emailNormalized: "a@test.it", phoneNormalized: "222" } }), // stessa email di o1
      makeOrder({ id: "o3", buyer: { firstName: "C", lastName: "Z", emailNormalized: "c@test.it", phoneNormalized: "222" } }), // stesso phone di o2
    ];
    expect(groupOrdersByBuyer(orders)).toHaveLength(1);
  });

  it("acquirenti diversi → gruppi distinti", () => {
    const orders = [
      makeOrder({ id: "o1", buyer: { firstName: "A", lastName: "X", emailNormalized: "a@test.it", phoneNormalized: "111" } }),
      makeOrder({ id: "o2", buyer: { firstName: "B", lastName: "Y", emailNormalized: "b@test.it", phoneNormalized: "222" } }),
    ];
    expect(groupOrdersByBuyer(orders)).toHaveLength(2);
  });

  it("totalSeats e totalSpentCents calcolati correttamente", () => {
    const orders = [
      makeOrder({ id: "o1", status: "paid", seats: 2, totalCents: 6000 }),
      makeOrder({ id: "o2", status: "paid", seats: 1, totalCents: 3000 }),
    ];
    const groups = groupOrdersByBuyer(orders);
    expect(groups[0]!.totalSeats).toBe(3);
    expect(groups[0]!.totalSpentCents).toBe(9000);
  });

  it("ordini refunded deducono da totalSpentCents", () => {
    const orders = [
      makeOrder({ id: "o1", status: "paid", totalCents: 6000, buyer: { firstName: "M", lastName: "R", emailNormalized: "m@t.it", phoneNormalized: "111" } }),
      makeOrder({ id: "o2", status: "refunded", totalCents: 6000, buyer: { firstName: "M", lastName: "R", emailNormalized: "m@t.it", phoneNormalized: "111" } }),
    ];
    const groups = groupOrdersByBuyer(orders);
    expect(groups[0]!.totalSpentCents).toBe(0);
  });

  it("ordini gratuiti (totalCents 0) contano su orderCount e seats", () => {
    const freeOrder = makeOrder({ id: "o1", totalCents: 0, seats: 5 });
    const groups = groupOrdersByBuyer([freeOrder]);
    expect(groups[0]!.totalSeats).toBe(5);
    expect(groups[0]!.totalSpentCents).toBe(0);
  });
});
