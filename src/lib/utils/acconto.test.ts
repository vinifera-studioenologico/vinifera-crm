/**
 * Test della logica acconto (rata 0 già pagata).
 *
 * Replica esattamente la logica presente in:
 *   - server/actions/clientPackages.ts (purchasePackage)
 *   - server/actions/samples.ts (createSample)
 *   - server/actions/payments.ts (createManualPayment)
 */
import { splitInCents } from "@/lib/utils/money";

// ── Helper che replica la logica server ───────────────────────────────
function computeAcconto(totalCents: number, accontoCents: number, count: number) {
  const hasAcconto = accontoCents > 0 && count > 1;
  const remaining = hasAcconto ? Math.max(0, totalCents - accontoCents) : totalCents;
  const isFullyPaid = hasAcconto && remaining === 0;

  const paidAmountCents = hasAcconto ? (isFullyPaid ? totalCents : accontoCents) : 0;
  const status = hasAcconto ? (isFullyPaid ? "paid" : "partial") : "pending";
  const installmentsCount = hasAcconto ? (isFullyPaid ? 1 : count + 1) : count;

  // Rate ordinarie
  const amounts = isFullyPaid ? [] : splitInCents(remaining, count);

  return { hasAcconto, remaining, isFullyPaid, paidAmountCents, status, installmentsCount, amounts };
}

// ── Test cases ────────────────────────────────────────────────────────

describe("Logica acconto pagamenti", () => {
  it("nessun acconto — comportamento classico", () => {
    const r = computeAcconto(120000, 0, 3); // €1.200, 0 acconto, 3 rate
    expect(r.hasAcconto).toBe(false);
    expect(r.status).toBe("pending");
    expect(r.paidAmountCents).toBe(0);
    expect(r.installmentsCount).toBe(3);
    expect(r.amounts).toEqual([40000, 40000, 40000]);
    expect(r.amounts.reduce((a, b) => a + b, 0)).toBe(120000);
  });

  it("acconto con 1 rata — ignorato (acconto solo con rate > 1)", () => {
    const r = computeAcconto(120000, 50000, 1);
    expect(r.hasAcconto).toBe(false);
    expect(r.status).toBe("pending");
    expect(r.paidAmountCents).toBe(0);
    expect(r.installmentsCount).toBe(1);
    expect(r.amounts).toEqual([120000]);
  });

  it("caso De Antoniis: €1.200 totale, €120 acconto, 3 rate", () => {
    const r = computeAcconto(120000, 12000, 3);
    expect(r.hasAcconto).toBe(true);
    expect(r.isFullyPaid).toBe(false);
    expect(r.status).toBe("partial");
    expect(r.paidAmountCents).toBe(12000); // €120 già incassato
    expect(r.remaining).toBe(108000); // €1.080 residuo
    expect(r.installmentsCount).toBe(4); // rata 0 + 3 rate
    expect(r.amounts).toEqual([36000, 36000, 36000]); // 3 rate da €360
    expect(r.amounts.reduce((a, b) => a + b, 0)).toBe(108000);
    // Totale contabile: acconto + rate = importo originale
    expect(r.paidAmountCents + r.amounts.reduce((a, b) => a + b, 0)).toBe(120000);
  });

  it("caso Macondo: €1.500 totale, €500 acconto, 3 rate", () => {
    const r = computeAcconto(150000, 50000, 3);
    expect(r.hasAcconto).toBe(true);
    expect(r.status).toBe("partial");
    expect(r.paidAmountCents).toBe(50000);
    expect(r.remaining).toBe(100000);
    expect(r.installmentsCount).toBe(4);
    // 3 rate da €333,33 + €333,34 (arrotondamento)
    expect(r.amounts.reduce((a, b) => a + b, 0)).toBe(100000);
    expect(r.paidAmountCents + r.amounts.reduce((a, b) => a + b, 0)).toBe(150000);
  });

  it("caso Antonini: acconto = totale (utente idiota) → paid", () => {
    const r = computeAcconto(198000, 198000, 3);
    expect(r.hasAcconto).toBe(true);
    expect(r.isFullyPaid).toBe(true);
    expect(r.status).toBe("paid");
    expect(r.paidAmountCents).toBe(198000);
    expect(r.remaining).toBe(0);
    expect(r.installmentsCount).toBe(1); // nessuna rata pendente
    expect(r.amounts).toEqual([]); // niente rate
  });

  it("acconto > totale (caso assurdo) → capped a 0 residuo", () => {
    const r = computeAcconto(100000, 150000, 2);
    expect(r.isFullyPaid).toBe(true);
    expect(r.status).toBe("paid");
    expect(r.remaining).toBe(0);
    expect(r.paidAmountCents).toBe(100000); // paga solo il totale, non di più
  });

  it("acconto dispari con 2 rate → splitInCents gestisce arrotondamento", () => {
    const r = computeAcconto(10001, 1, 2); // €100,01 - 1 cent acconto → 10000 residuo
    expect(r.remaining).toBe(10000);
    expect(r.amounts).toEqual([5000, 5000]);
    expect(r.paidAmountCents + r.amounts.reduce((a, b) => a + b, 0)).toBe(10001);
  });

  it("stats.pendingAmountCents = residuo, non totale", () => {
    // Questo è il valore che viene usato per FieldValue.increment()
    const r = computeAcconto(120000, 12000, 3);
    const pendingIncrement = r.isFullyPaid ? 0 : r.remaining;
    expect(pendingIncrement).toBe(108000); // non 120000!
  });
});
