/**
 * §18.3 — Calcolo totale campione.
 * Funzione PURA.
 */

export interface SampleItemForCalc {
  unitPriceCents: number;
  coveredByPackageId?: string | null;
  chargeAnyway: boolean;
}

/**
 * Calcola il totale stimato di un campione.
 * Se un'analisi è coperta da pacchetto e chargeAnyway=false → costo 0.
 */
export function computeSampleTotal(items: SampleItemForCalc[]): number {
  return items.reduce((acc, item) => {
    const isFree = item.coveredByPackageId && !item.chargeAnyway;
    return acc + (isFree ? 0 : item.unitPriceCents);
  }, 0);
}
