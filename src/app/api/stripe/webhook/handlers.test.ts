import { describe, it, expect } from "vitest";
import {
  decidePaymentIntentSucceeded,
  decidePaymentIntentFailed,
  decidePaymentIntentCanceled,
  decideChargeRefunded,
  type OrderSnapshot,
  type EventSeats,
} from "@/app/api/stripe/webhook/handlers";

// ── Fixtures ─────────────────────────────────────────────────────────
function makeOrder(overrides: Partial<OrderSnapshot> = {}): OrderSnapshot {
  return {
    id: "order-123",
    status: "pending_payment",
    seats: 2,
    paymentIntentId: "pi_test_123",
    eventId: "event-abc",
    locale: "it",
    buyer: { firstName: "Mario", lastName: "Rossi", email: "mario@example.it" },
    eventSnapshot: { titleIt: "Test Event", startsAt: null, locationName: "Roma" },
    orderNumber: "EVT-2026-0001",
    totalCents: 6000,
    billing: null,
    ...overrides,
  };
}

function makeSeats(overrides: Partial<EventSeats> = {}): EventSeats {
  return { capacity: 20, seatsSold: 5, seatsHeld: 2, ...overrides };
}

const SE_ID = "evt_stripe_001";
const NOW = new Date("2026-11-01T12:00:00Z");

// ── payment_intent.succeeded ──────────────────────────────────────────
describe("decidePaymentIntentSucceeded", () => {
  it("pending_payment → paid, seatsHeld--, seatsSold++", () => {
    const result = decidePaymentIntentSucceeded(makeOrder(), makeSeats(), SE_ID, 6000, NOW);

    expect(result.orderPatch).toMatchObject({ status: "paid" });
    expect(result.eventPatch).toMatchObject({ seatsHeld_dec: 2, seatsSold_inc: 2 });
    expect(result.sideEffects.some((e) => e.type === "send_confirmation_email")).toBe(true);
    expect(result.sideEffects.some((e) => e.type === "trigger_revalidation")).toBe(true);
  });

  it("già paid → no-op (idempotente)", () => {
    const result = decidePaymentIntentSucceeded(makeOrder({ status: "paid" }), makeSeats(), SE_ID, 6000, NOW);
    expect(result.orderPatch).toBeNull();
    expect(result.eventPatch).toBeNull();
  });

  it("expired con posti disponibili → recovery (paid + seatsSold++)", () => {
    const order = makeOrder({ status: "expired" });
    const seats = makeSeats({ capacity: 20, seatsSold: 5, seatsHeld: 0 });
    const result = decidePaymentIntentSucceeded(order, seats, SE_ID, 6000, NOW);

    expect(result.orderPatch).toMatchObject({ status: "paid" });
    expect(result.eventPatch).toMatchObject({ seatsSold_inc: 2 });
    expect(result.sideEffects.some((e) => e.type === "send_confirmation_email")).toBe(true);
  });

  it("expired senza posti → auto-refund, ordine resta expired", () => {
    const order = makeOrder({ status: "expired" });
    const seats = makeSeats({ capacity: 5, seatsSold: 5, seatsHeld: 0 }); // 0 posti liberi
    const result = decidePaymentIntentSucceeded(order, seats, SE_ID, 6000, NOW);

    expect(result.orderPatch).toBeNull(); // non cambia stato
    expect(result.sideEffects.some((e) => e.type === "auto_refund")).toBe(true);
    expect(result.sideEffects.some((e) => e.type === "send_refund_email_sold_out")).toBe(true);
  });

  it("ordine gratuito (paymentIntentId null) → no-op", () => {
    const result = decidePaymentIntentSucceeded(
      makeOrder({ paymentIntentId: null }),
      makeSeats(),
      SE_ID,
      0,
      NOW,
    );
    expect(result.orderPatch).toBeNull();
    expect(result.sideEffects).toHaveLength(0);
  });
});

// ── payment_intent.payment_failed ─────────────────────────────────────
describe("decidePaymentIntentFailed", () => {
  it("pending_payment → solo log transazione, ordine invariato", () => {
    const result = decidePaymentIntentFailed(makeOrder(), SE_ID, "Card declined");
    expect(result.orderPatch).toBeNull();
    expect(result.eventPatch).toBeNull();
    expect(result.sideEffects.some((e) => e.type === "log_transaction")).toBe(true);
  });

  it("ordine gratuito → no-op", () => {
    const result = decidePaymentIntentFailed(makeOrder({ paymentIntentId: null }), SE_ID, null);
    expect(result.sideEffects).toHaveLength(0);
  });
});

// ── payment_intent.canceled ───────────────────────────────────────────
describe("decidePaymentIntentCanceled", () => {
  it("pending_payment → failed + seatsHeld--", () => {
    const result = decidePaymentIntentCanceled(makeOrder({ status: "pending_payment" }), SE_ID);
    expect(result.orderPatch).toMatchObject({ status: "failed" });
    expect(result.eventPatch).toMatchObject({ seatsHeld_dec: 2 });
  });

  it("expired → no-op (idempotente)", () => {
    const result = decidePaymentIntentCanceled(makeOrder({ status: "expired" }), SE_ID);
    expect(result.orderPatch).toBeNull();
    expect(result.eventPatch).toBeNull();
  });

  it("failed → no-op (idempotente)", () => {
    const result = decidePaymentIntentCanceled(makeOrder({ status: "failed" }), SE_ID);
    expect(result.orderPatch).toBeNull();
  });

  it("ordine gratuito → no-op", () => {
    const result = decidePaymentIntentCanceled(makeOrder({ paymentIntentId: null }), SE_ID);
    expect(result.sideEffects).toHaveLength(0);
  });
});

// ── charge.refunded ───────────────────────────────────────────────────
describe("decideChargeRefunded", () => {
  it("paid → refunded, seatsSold--, revalidation", () => {
    const result = decideChargeRefunded(makeOrder({ status: "paid" }), SE_ID, "re_test_001", 6000);
    expect(result.orderPatch).toMatchObject({ status: "refunded", refundId: "re_test_001" });
    expect(result.eventPatch).toMatchObject({ seatsSold_dec: 2 });
    expect(result.sideEffects.some((e) => e.type === "trigger_revalidation")).toBe(true);
  });

  it("già refunded → no-op (idempotente)", () => {
    const result = decideChargeRefunded(makeOrder({ status: "refunded" }), SE_ID, "re_001", 6000);
    expect(result.orderPatch).toBeNull();
    expect(result.eventPatch).toBeNull();
  });

  it("ordine gratuito → no-op", () => {
    const result = decideChargeRefunded(
      makeOrder({ paymentIntentId: null, status: "paid" }),
      SE_ID,
      "re_001",
      0,
    );
    expect(result.sideEffects).toHaveLength(0);
  });
});
