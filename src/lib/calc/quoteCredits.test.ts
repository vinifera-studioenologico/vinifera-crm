import { describe, it, expect } from "vitest";
import { deriveQuoteCredits } from "@/lib/calc/quoteCredits";
import type { QuoteItem } from "@/schemas/quote";

describe("deriveQuoteCredits", () => {
  it("lista vuota → nessun credito", () => {
    expect(deriveQuoteCredits([])).toEqual([]);
  });

  it("riga kind:'free' → nessun credito", () => {
    const items: QuoteItem[] = [
      { kind: "free", description: "Consulenza", quantity: 1, unitPriceCents: 5000 },
    ];
    expect(deriveQuoteCredits(items)).toEqual([]);
  });

  it("riga kind:'package' → nessun credito (la gestisce purchasePackage)", () => {
    const items: QuoteItem[] = [
      {
        kind: "package",
        packageId: "pkg1",
        nameSnapshot: "Pacchetto Base",
        quantity: 1,
        unitPriceCents: 20000,
      },
    ];
    expect(deriveQuoteCredits(items)).toEqual([]);
  });

  it("riga kind:'analysis' con quantità frazionaria → nessun credito", () => {
    const items: QuoteItem[] = [
      {
        kind: "analysis",
        analysisId: "an_ph",
        nameSnapshot: "pH",
        quantity: 2.5,
        unitPriceCents: 1500,
      },
    ];
    expect(deriveQuoteCredits(items)).toEqual([]);
  });

  it("riga kind:'analysis' con quantità intera → un credito", () => {
    const items: QuoteItem[] = [
      {
        kind: "analysis",
        analysisId: "an_ph",
        nameSnapshot: "pH",
        quantity: 3,
        unitPriceCents: 1500,
      },
    ];
    expect(deriveQuoteCredits(items)).toEqual([
      { analysisId: "an_ph", analysisNameSnapshot: "pH", quantity: 3, totalPriceCents: 4500 },
    ]);
  });

  it("due righe sulla stessa analisi → due crediti distinti, non fusi", () => {
    const items: QuoteItem[] = [
      { kind: "analysis", analysisId: "an_ph", nameSnapshot: "pH", quantity: 2, unitPriceCents: 1000 },
      { kind: "analysis", analysisId: "an_ph", nameSnapshot: "pH", quantity: 1, unitPriceCents: 1200 },
    ];
    expect(deriveQuoteCredits(items)).toEqual([
      { analysisId: "an_ph", analysisNameSnapshot: "pH", quantity: 2, totalPriceCents: 2000 },
      { analysisId: "an_ph", analysisNameSnapshot: "pH", quantity: 1, totalPriceCents: 1200 },
    ]);
  });

  it("quantità zero o negativa → nessun credito (guardia difensiva)", () => {
    const items: QuoteItem[] = [
      { kind: "analysis", analysisId: "an_ph", nameSnapshot: "pH", quantity: 0, unitPriceCents: 1000 },
    ];
    expect(deriveQuoteCredits(items)).toEqual([]);
  });

  it("preventivo misto: solo la riga analisi intera genera credito", () => {
    const items: QuoteItem[] = [
      { kind: "free", description: "Sopralluogo", quantity: 1, unitPriceCents: 3000 },
      {
        kind: "package",
        packageId: "pkg1",
        nameSnapshot: "Pacchetto Base",
        quantity: 1,
        unitPriceCents: 20000,
      },
      { kind: "analysis", analysisId: "an_densita", nameSnapshot: "Densità", quantity: 2, unitPriceCents: 800 },
    ];
    expect(deriveQuoteCredits(items)).toEqual([
      { analysisId: "an_densita", analysisNameSnapshot: "Densità", quantity: 2, totalPriceCents: 1600 },
    ]);
  });
});
