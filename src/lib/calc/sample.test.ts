import { describe, it, expect } from "vitest";
import { computeSampleTotal, assignPackageCoverage } from "@/lib/calc/sample";

describe("computeSampleTotal", () => {
  it("somma tutti i prezzi senza pacchetti", () => {
    expect(
      computeSampleTotal([
        { unitPriceCents: 2000, chargeAnyway: false },
        { unitPriceCents: 3000, chargeAnyway: false },
      ]),
    ).toBe(5000);
  });

  it("esclude analisi coperte da pacchetto", () => {
    expect(
      computeSampleTotal([
        { unitPriceCents: 2000, coveredByPackageId: "pkg1", chargeAnyway: false },
        { unitPriceCents: 3000, chargeAnyway: false },
      ]),
    ).toBe(3000);
  });

  it("addebita comunque se chargeAnyway=true anche con pacchetto", () => {
    expect(
      computeSampleTotal([
        { unitPriceCents: 2000, coveredByPackageId: "pkg1", chargeAnyway: true },
        { unitPriceCents: 3000, chargeAnyway: false },
      ]),
    ).toBe(5000);
  });

  it("totale 0 se tutte coperte", () => {
    expect(
      computeSampleTotal([
        { unitPriceCents: 1000, coveredByPackageId: "pkg1", chargeAnyway: false },
        { unitPriceCents: 2000, coveredByPackageId: "pkg1", chargeAnyway: false },
      ]),
    ).toBe(0);
  });

  it("lista vuota restituisce 0", () => {
    expect(computeSampleTotal([])).toBe(0);
  });
});

describe("assignPackageCoverage", () => {
  it("nessun pacchetto: tutte le nuove analisi restano a pagamento", () => {
    const { coverage, decrements } = assignPackageCoverage([], 3);
    expect(coverage).toEqual([null, null, null]);
    expect(decrements).toEqual({});
  });

  it("count 0: nessuna assegnazione", () => {
    const { coverage, decrements } = assignPackageCoverage(
      [{ id: "pkg1", remainingAnalyses: 5 }],
      0,
    );
    expect(coverage).toEqual([]);
    expect(decrements).toEqual({});
  });

  it("assegna tutte al primo pacchetto se ha slot a sufficienza", () => {
    const { coverage, decrements } = assignPackageCoverage(
      [{ id: "pkg1", remainingAnalyses: 5 }],
      2,
    );
    expect(coverage).toEqual(["pkg1", "pkg1"]);
    expect(decrements).toEqual({ pkg1: 2 });
  });

  it("esaurisce il primo pacchetto e passa al secondo (in ordine)", () => {
    const { coverage, decrements } = assignPackageCoverage(
      [
        { id: "pkg1", remainingAnalyses: 1 },
        { id: "pkg2", remainingAnalyses: 5 },
      ],
      3,
    );
    expect(coverage).toEqual(["pkg1", "pkg2", "pkg2"]);
    expect(decrements).toEqual({ pkg1: 1, pkg2: 2 });
  });

  it("slot insufficienti complessivi: le eccedenti restano a pagamento (null)", () => {
    const { coverage, decrements } = assignPackageCoverage(
      [
        { id: "pkg1", remainingAnalyses: 1 },
        { id: "pkg2", remainingAnalyses: 1 },
      ],
      4,
    );
    expect(coverage).toEqual(["pkg1", "pkg2", null, null]);
    expect(decrements).toEqual({ pkg1: 1, pkg2: 1 });
  });

  it("pacchetto con 0 slot viene saltato", () => {
    const { coverage, decrements } = assignPackageCoverage(
      [
        { id: "pkg1", remainingAnalyses: 0 },
        { id: "pkg2", remainingAnalyses: 2 },
      ],
      2,
    );
    expect(coverage).toEqual(["pkg2", "pkg2"]);
    expect(decrements).toEqual({ pkg2: 2 });
  });

  it("non scala mai più slot di quelli disponibili", () => {
    const { decrements } = assignPackageCoverage(
      [{ id: "pkg1", remainingAnalyses: 2 }],
      10,
    );
    expect(decrements).toEqual({ pkg1: 2 });
  });
});

