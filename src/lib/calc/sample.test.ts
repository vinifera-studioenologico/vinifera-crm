import { describe, it, expect } from "vitest";
import { computeSampleTotal } from "@/lib/calc/sample";

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
