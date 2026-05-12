import { describe, it, expect } from "vitest";
import { computeQuoteTotals } from "@/lib/calc/quote";

describe("computeQuoteTotals", () => {
  it("calcola subtotale correttamente", () => {
    const result = computeQuoteTotals({
      items: [
        { quantity: 2, unitPriceCents: 5000 }, // 100€
        { quantity: 1, unitPriceCents: 2000 }, // 20€
      ],
      discounts: [],
      taxes: [],
    });
    expect(result.subtotalCents).toBe(12000);
    expect(result.discountedCents).toBe(12000);
    expect(result.totalCents).toBe(12000);
  });

  it("applica sconto percentuale", () => {
    const result = computeQuoteTotals({
      items: [{ quantity: 1, unitPriceCents: 10000 }],
      discounts: [{ type: "percent", value: 10 }],
      taxes: [],
    });
    expect(result.discountedCents).toBe(9000);
    expect(result.totalCents).toBe(9000);
  });

  it("applica sconto fisso in centesimi", () => {
    const result = computeQuoteTotals({
      items: [{ quantity: 1, unitPriceCents: 10000 }],
      discounts: [{ type: "fixed", value: 1000 }],
      taxes: [],
    });
    expect(result.discountedCents).toBe(9000);
  });

  it("totale non scende sotto 0 con sconto eccessivo", () => {
    const result = computeQuoteTotals({
      items: [{ quantity: 1, unitPriceCents: 5000 }],
      discounts: [{ type: "fixed", value: 9999 }],
      taxes: [],
    });
    expect(result.discountedCents).toBe(0);
    expect(result.totalCents).toBe(0);
  });

  it("applica Enpaia 4% + IVA 22% sull'imponibile scontato", () => {
    // 100€ subtotale, nessuno sconto
    // Enpaia: 100 * 4% = 4€ → totale 104€
    // IVA: calcolata sull'imponibile (afterDiscounts = 10000), non su 10400
    const result = computeQuoteTotals({
      items: [{ quantity: 1, unitPriceCents: 10000 }],
      discounts: [],
      taxes: [
        { percent: 4, applied: true },  // Enpaia
        { percent: 22, applied: true }, // IVA
      ],
    });
    // 10000 + 400 (Enpaia) + 2200 (IVA su imponibile 10000) = 12600
    expect(result.totalCents).toBe(12600);
  });

  it("ignora tasse non applicate", () => {
    const result = computeQuoteTotals({
      items: [{ quantity: 1, unitPriceCents: 10000 }],
      discounts: [],
      taxes: [{ percent: 22, applied: false }],
    });
    expect(result.totalCents).toBe(10000);
  });

  it("preventivo vuoto restituisce tutto a 0", () => {
    const result = computeQuoteTotals({ items: [], discounts: [], taxes: [] });
    expect(result.subtotalCents).toBe(0);
    expect(result.totalCents).toBe(0);
  });
});
