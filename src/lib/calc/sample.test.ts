import { describe, it, expect } from "vitest";
import { computeSampleTotal, assignPackageCoverage, pickSlotForAnalysis } from "@/lib/calc/sample";

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
    const { coverage, decrements } = assignPackageCoverage([], ["an1", "an2", "an3"]);
    expect(coverage).toEqual([null, null, null]);
    expect(decrements).toEqual({});
  });

  it("lista vuota: nessuna assegnazione", () => {
    const { coverage, decrements } = assignPackageCoverage(
      [{ id: "pkg1", remainingAnalyses: 5 }],
      [],
    );
    expect(coverage).toEqual([]);
    expect(decrements).toEqual({});
  });

  it("assegna tutte al primo pacchetto se ha slot a sufficienza", () => {
    const { coverage, decrements } = assignPackageCoverage(
      [{ id: "pkg1", remainingAnalyses: 5 }],
      ["an1", "an2"],
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
      ["an1", "an2", "an3"],
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
      ["an1", "an2", "an3", "an4"],
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
      ["an1", "an2"],
    );
    expect(coverage).toEqual(["pkg2", "pkg2"]);
    expect(decrements).toEqual({ pkg2: 2 });
  });

  it("non scala mai più slot di quelli disponibili", () => {
    const { decrements } = assignPackageCoverage(
      [{ id: "pkg1", remainingAnalyses: 2 }],
      Array.from({ length: 10 }, (_, i) => `an${i}`),
    );
    expect(decrements).toEqual({ pkg1: 2 });
  });

  // ── Crediti da preventivo: restrictedToAnalysisId ────────────────────

  it("un credito ristretto a un'analisi NON copre un'analisi diversa", () => {
    const { coverage, decrements } = assignPackageCoverage(
      [{ id: "credit_ph", remainingAnalyses: 3, restrictedToAnalysisId: "an_ph" }],
      ["an_densita"],
    );
    expect(coverage).toEqual([null]);
    expect(decrements).toEqual({});
  });

  it("un credito ristretto copre la propria analisi", () => {
    const { coverage, decrements } = assignPackageCoverage(
      [{ id: "credit_ph", remainingAnalyses: 3, restrictedToAnalysisId: "an_ph" }],
      ["an_ph", "an_ph"],
    );
    expect(coverage).toEqual(["credit_ph", "credit_ph"]);
    expect(decrements).toEqual({ credit_ph: 2 });
  });

  it("con credito ristretto e pacchetto generico entrambi disponibili, si consuma prima il ristretto", () => {
    const { coverage, decrements } = assignPackageCoverage(
      [
        { id: "pkg_generico", remainingAnalyses: 5 },
        { id: "credit_ph", remainingAnalyses: 2, restrictedToAnalysisId: "an_ph" },
      ],
      ["an_ph"],
    );
    expect(coverage).toEqual(["credit_ph"]);
    expect(decrements).toEqual({ credit_ph: 1 });
  });

  it("credito ristretto esaurito: si passa al pacchetto generico", () => {
    const { coverage, decrements } = assignPackageCoverage(
      [
        { id: "credit_ph", remainingAnalyses: 1, restrictedToAnalysisId: "an_ph" },
        { id: "pkg_generico", remainingAnalyses: 5 },
      ],
      ["an_ph", "an_ph"],
    );
    expect(coverage).toEqual(["credit_ph", "pkg_generico"]);
    expect(decrements).toEqual({ credit_ph: 1, pkg_generico: 1 });
  });

  it("più analisi diverse in un colpo: ognuna prende il proprio credito ristretto, le altre il generico", () => {
    const { coverage, decrements } = assignPackageCoverage(
      [
        { id: "credit_ph", remainingAnalyses: 1, restrictedToAnalysisId: "an_ph" },
        { id: "credit_densita", remainingAnalyses: 1, restrictedToAnalysisId: "an_densita" },
        { id: "pkg_generico", remainingAnalyses: 5 },
      ],
      ["an_ph", "an_densita", "an_alcol"],
    );
    expect(coverage).toEqual(["credit_ph", "credit_densita", "pkg_generico"]);
    expect(decrements).toEqual({ credit_ph: 1, credit_densita: 1, pkg_generico: 1 });
  });

  it("un pacchetto generico continua a coprire qualsiasi analisi (nessuna regressione)", () => {
    const { coverage, decrements } = assignPackageCoverage(
      [{ id: "pkg_generico", remainingAnalyses: 3 }],
      ["an_ph", "an_densita", "an_alcol"],
    );
    expect(coverage).toEqual(["pkg_generico", "pkg_generico", "pkg_generico"]);
    expect(decrements).toEqual({ pkg_generico: 3 });
  });
});

describe("pickSlotForAnalysis", () => {
  it("nessuno slot libero restituisce null", () => {
    const result = pickSlotForAnalysis(
      [{ id: "pkg1", remainingAnalyses: 0 }],
      "an_ph",
      new Map([["pkg1", 0]]),
    );
    expect(result).toBeNull();
  });

  it("ignora uno slot ristretto a un'altra analisi anche se libero", () => {
    const result = pickSlotForAnalysis(
      [{ id: "credit_ph", remainingAnalyses: 2, restrictedToAnalysisId: "an_ph" }],
      "an_densita",
      new Map([["credit_ph", 2]]),
    );
    expect(result).toBeNull();
  });
});
