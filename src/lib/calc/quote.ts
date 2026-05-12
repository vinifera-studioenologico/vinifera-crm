import { applyPercentCents } from "@/lib/utils/money";

// ─── Tipi locali minimi (non importiamo i tipi Firestore qui per mantenere le funzioni pure) ───

export interface QuoteItem {
  quantity: number;
  unitPriceCents: number;
}

export interface QuoteDiscount {
  type: "percent" | "fixed";
  value: number; // se "percent": numero (es. 10), se "fixed": centesimi
}

export interface QuoteTax {
  percent: number;
  applied: boolean;
}

export interface QuoteTotalsInput {
  items: QuoteItem[];
  discounts: QuoteDiscount[];
  taxes: QuoteTax[];
}

export interface QuoteTotalsOutput {
  subtotalCents: number;
  discountedCents: number;
  totalCents: number;
}

/**
 * §18.3 — Calcolo totali preventivo.
 * Funzione PURA: nessun IO. Usata identicamente client e server.
 */
export function computeQuoteTotals(input: QuoteTotalsInput): QuoteTotalsOutput {
  const subtotalCents = input.items.reduce(
    (acc, it) => acc + mulQty(it.unitPriceCents, it.quantity),
    0,
  );

  let afterDiscounts = subtotalCents;
  for (const d of input.discounts) {
    const cut =
      d.type === "percent"
        ? applyPercentCents(afterDiscounts, d.value)
        : d.value; // già in centesimi
    afterDiscounts -= cut;
  }
  afterDiscounts = Math.max(0, afterDiscounts);

  let afterTaxes = afterDiscounts;
  for (const t of input.taxes) {
    if (!t.applied) continue;
    afterTaxes += applyPercentCents(afterDiscounts, t.percent);
  }

  return {
    subtotalCents,
    discountedCents: afterDiscounts,
    totalCents: afterTaxes,
  };
}

function mulQty(cents: number, qty: number): number {
  return Math.round(cents * qty);
}
