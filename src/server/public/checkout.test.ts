import { describe, it, expect } from "vitest";
import {
  isHoneypot,
  chooseCheckoutBranch,
  validateBillingPresence,
  validateMaxSeatsPerOrder,
  computeOrderAmounts,
  shouldResumePendingOrder,
} from "@/server/public/checkout-logic";

describe("isHoneypot", () => {
  it("restituisce false se website è stringa vuota", () => {
    expect(isHoneypot("")).toBe(false);
  });
  it("restituisce false se website è undefined", () => {
    expect(isHoneypot(undefined)).toBe(false);
  });
  it("restituisce true se website è valorizzato", () => {
    expect(isHoneypot("http://bot.example.com")).toBe(true);
    expect(isHoneypot("   x   ")).toBe(true);
  });
});

describe("chooseCheckoutBranch", () => {
  it("restituisce free se priceCents === 0", () => {
    expect(chooseCheckoutBranch({ priceCents: 0 })).toBe("free");
  });
  it("restituisce payment se priceCents > 0", () => {
    expect(chooseCheckoutBranch({ priceCents: 50 })).toBe("payment");
    expect(chooseCheckoutBranch({ priceCents: 3000 })).toBe("payment");
  });
});

describe("validateBillingPresence", () => {
  it("free + billing presente → errore billing_forbidden_for_free_event", () => {
    expect(validateBillingPresence("free", true)).toBe("billing_forbidden_for_free_event");
  });
  it("free + billing assente → ok", () => {
    expect(validateBillingPresence("free", false)).toBeNull();
  });
  it("payment + billing presente → ok", () => {
    expect(validateBillingPresence("payment", true)).toBeNull();
  });
  it("payment + billing assente → errore billing_required_for_paid_event", () => {
    expect(validateBillingPresence("payment", false)).toBe("billing_required_for_paid_event");
  });
});

describe("validateMaxSeatsPerOrder", () => {
  it("null = nessun limite → sempre ok", () => {
    expect(validateMaxSeatsPerOrder(null, 100)).toBe(true);
  });
  it("seats <= max → ok", () => {
    expect(validateMaxSeatsPerOrder(4, 4)).toBe(true);
    expect(validateMaxSeatsPerOrder(4, 1)).toBe(true);
  });
  it("seats > max → rifiutato", () => {
    expect(validateMaxSeatsPerOrder(4, 5)).toBe(false);
  });
});

describe("computeOrderAmounts", () => {
  it("usa il prezzo pieno se discountedPriceCents è null", () => {
    const result = computeOrderAmounts({ priceCents: 3000, discountedPriceCents: null }, 2);
    expect(result.unitPriceCents).toBe(3000);
    expect(result.totalCents).toBe(6000);
  });
  it("usa il prezzo scontato se discountedPriceCents è valorizzato", () => {
    const result = computeOrderAmounts({ priceCents: 3000, discountedPriceCents: 2000 }, 3);
    expect(result.unitPriceCents).toBe(2000);
    expect(result.totalCents).toBe(6000);
  });
  it("evento gratuito → totalCents 0", () => {
    const result = computeOrderAmounts({ priceCents: 0, discountedPriceCents: null }, 2);
    expect(result.unitPriceCents).toBe(0);
    expect(result.totalCents).toBe(0);
  });
});

describe("shouldResumePendingOrder", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const makeTs = (d: Date) => ({ toMillis: () => d.getTime() });

  it("ordine non pending_payment → false", () => {
    expect(
      shouldResumePendingOrder(
        { status: "paid", holdExpiresAt: makeTs(new Date("2026-11-01T12:15:00Z")) },
        now,
      ),
    ).toBe(false);
  });

  it("holdExpiresAt null → false", () => {
    expect(
      shouldResumePendingOrder({ status: "pending_payment", holdExpiresAt: null }, now),
    ).toBe(false);
  });

  it("hold scaduto tra < 60s → false (non vale la pena riprendere)", () => {
    const expiresAt = makeTs(new Date(now.getTime() + 30_000));
    expect(
      shouldResumePendingOrder({ status: "pending_payment", holdExpiresAt: expiresAt }, now),
    ).toBe(false);
  });

  it("hold valido (scade tra > 60s) → true", () => {
    const expiresAt = makeTs(new Date(now.getTime() + 10 * 60 * 1000));
    expect(
      shouldResumePendingOrder({ status: "pending_payment", holdExpiresAt: expiresAt }, now),
    ).toBe(true);
  });
});
