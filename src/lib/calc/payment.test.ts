import { describe, it, expect } from "vitest";
import { derivePaymentStatus } from "@/lib/calc/payment";

const PAST = new Date(2020, 0, 1);
const FUTURE = new Date(2099, 0, 1);
const NOW = new Date(2026, 4, 11); // 11 maggio 2026

describe("derivePaymentStatus", () => {
  it("cancelled se il pagamento è annullato", () => {
    expect(
      derivePaymentStatus(
        { totalAmountCents: 1000, paidAmountCents: 0, cancelled: true },
        [],
        NOW,
      ),
    ).toBe("cancelled");
  });

  it("paid se paidAmount >= totalAmount", () => {
    expect(
      derivePaymentStatus(
        { totalAmountCents: 1000, paidAmountCents: 1000, cancelled: false },
        [],
        NOW,
      ),
    ).toBe("paid");
  });

  it("paid anche se pagato di più (sovrapagamento)", () => {
    expect(
      derivePaymentStatus(
        { totalAmountCents: 1000, paidAmountCents: 1500, cancelled: false },
        [],
        NOW,
      ),
    ).toBe("paid");
  });

  it("overdue se c'è una rata pending con dueDate nel passato", () => {
    expect(
      derivePaymentStatus(
        { totalAmountCents: 1000, paidAmountCents: 0, cancelled: false },
        [{ status: "pending", dueDate: PAST, amountCents: 1000 }],
        NOW,
      ),
    ).toBe("overdue");
  });

  it("partial se pagato parzialmente senza rate scadute", () => {
    expect(
      derivePaymentStatus(
        { totalAmountCents: 1000, paidAmountCents: 500, cancelled: false },
        [{ status: "pending", dueDate: FUTURE, amountCents: 500 }],
        NOW,
      ),
    ).toBe("partial");
  });

  it("pending se non pagato e nessuna rata scaduta", () => {
    expect(
      derivePaymentStatus(
        { totalAmountCents: 1000, paidAmountCents: 0, cancelled: false },
        [{ status: "pending", dueDate: FUTURE, amountCents: 1000 }],
        NOW,
      ),
    ).toBe("pending");
  });

  it("pending con lista installments vuota", () => {
    expect(
      derivePaymentStatus(
        { totalAmountCents: 1000, paidAmountCents: 0, cancelled: false },
        [],
        NOW,
      ),
    ).toBe("pending");
  });
});
