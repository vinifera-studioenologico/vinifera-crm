import { describe, it, expect } from "vitest";
import {
  categorizeOrdersForCancellation,
  computeTotalRefundCents,
  deduplicateBuyerEmails,
  type OrderForCancellation,
} from "@/server/actions/event-refund-logic";

function makeOrder(overrides: Partial<OrderForCancellation> = {}): OrderForCancellation {
  return {
    id: "order-1",
    status: "paid",
    paymentIntentId: "pi_test",
    totalCents: 3000,
    seats: 2,
    locale: "it",
    buyer: {
      email: "mario@example.it",
      emailNormalized: "mario@example.it",
      firstName: "Mario",
      lastName: "Rossi",
    },
    ...overrides,
  };
}

describe("categorizeOrdersForCancellation", () => {
  it("paid + paymentIntentId → paidPaid (Stripe refund)", () => {
    const plan = categorizeOrdersForCancellation([makeOrder()]);
    expect(plan.paidPaid).toHaveLength(1);
    expect(plan.paidFree).toHaveLength(0);
  });

  it("paid senza paymentIntentId → paidFree (cancel diretto)", () => {
    const plan = categorizeOrdersForCancellation([makeOrder({ paymentIntentId: null })]);
    expect(plan.paidFree).toHaveLength(1);
    expect(plan.paidPaid).toHaveLength(0);
  });

  it("pending_payment con PI → pendingPaid (cancel PI + expired)", () => {
    const plan = categorizeOrdersForCancellation([
      makeOrder({ status: "pending_payment", paymentIntentId: "pi_pending" }),
    ]);
    expect(plan.pendingPaid).toHaveLength(1);
  });

  it("refunded/cancelled/failed/expired → skip", () => {
    const orders = [
      makeOrder({ status: "refunded" }),
      makeOrder({ status: "cancelled" }),
      makeOrder({ status: "failed" }),
      makeOrder({ status: "expired" }),
    ];
    const plan = categorizeOrdersForCancellation(orders);
    expect(plan.skip).toHaveLength(4);
    expect(plan.paidPaid).toHaveLength(0);
  });

  it("mix reale: ordini diversi vengono smistati correttamente", () => {
    const orders = [
      makeOrder({ id: "o1", paymentIntentId: "pi_1", totalCents: 6000 }),
      makeOrder({ id: "o2", paymentIntentId: null }),  // gratuito
      makeOrder({ id: "o3", status: "pending_payment", paymentIntentId: "pi_3" }),
      makeOrder({ id: "o4", status: "refunded" }),
    ];
    const plan = categorizeOrdersForCancellation(orders);
    expect(plan.paidPaid).toHaveLength(1);
    expect(plan.paidFree).toHaveLength(1);
    expect(plan.pendingPaid).toHaveLength(1);
    expect(plan.skip).toHaveLength(1);
  });
});

describe("computeTotalRefundCents", () => {
  it("somma solo gli ordini paidPaid", () => {
    const plan = categorizeOrdersForCancellation([
      makeOrder({ id: "o1", totalCents: 3000 }),
      makeOrder({ id: "o2", totalCents: 1500 }),
      makeOrder({ id: "o3", paymentIntentId: null, totalCents: 0 }),
    ]);
    expect(computeTotalRefundCents(plan)).toBe(4500);
  });

  it("zero se nessun ordine a pagamento paid", () => {
    const plan = categorizeOrdersForCancellation([makeOrder({ paymentIntentId: null })]);
    expect(computeTotalRefundCents(plan)).toBe(0);
  });
});

describe("deduplicateBuyerEmails", () => {
  it("dedup su emailNormalized: due ordini stessa email → un destinatario", () => {
    const orders = [
      makeOrder({ id: "o1", buyer: { email: "Mario@test.it", emailNormalized: "mario@test.it", firstName: "Mario", lastName: "R" } }),
      makeOrder({ id: "o2", buyer: { email: "Mario@test.it", emailNormalized: "mario@test.it", firstName: "Mario", lastName: "R" } }),
    ];
    expect(deduplicateBuyerEmails(orders)).toHaveLength(1);
  });

  it("email diverse → tutti presenti", () => {
    const orders = [
      makeOrder({ id: "o1", buyer: { email: "a@test.it", emailNormalized: "a@test.it", firstName: "A", lastName: "X" } }),
      makeOrder({ id: "o2", buyer: { email: "b@test.it", emailNormalized: "b@test.it", firstName: "B", lastName: "Y" } }),
    ];
    expect(deduplicateBuyerEmails(orders)).toHaveLength(2);
  });

  it("esclude ordini non paid", () => {
    const orders = [
      makeOrder({ status: "refunded" }),
      makeOrder({ status: "cancelled" }),
    ];
    expect(deduplicateBuyerEmails(orders)).toHaveLength(0);
  });

  it("variante email (case diverso) viene deduplicata correttamente", () => {
    const orders = [
      makeOrder({ id: "o1", buyer: { email: "Test@Example.com", emailNormalized: "test@example.com", firstName: "T", lastName: "E" } }),
      makeOrder({ id: "o2", buyer: { email: "test@EXAMPLE.com", emailNormalized: "test@example.com", firstName: "T", lastName: "E" } }),
    ];
    expect(deduplicateBuyerEmails(orders)).toHaveLength(1);
  });
});
