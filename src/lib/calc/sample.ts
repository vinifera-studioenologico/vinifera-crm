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

// ── Assegnazione copertura pacchetto per nuove analisi ─────────────────
export interface PackageSlot {
  id: string;
  remainingAnalyses: number;
}

/**
 * Assegna la copertura da pacchetto a `count` nuove analisi aggiunte a un
 * campione esistente. Consuma gli slot in ordine dei pacchetti forniti
 * (il primo con slot liberi vince).
 *
 * IMPORTANTE: non considera gli item già presenti nel campione — i loro slot
 * sono già stati scalati dal contatore `remainingAnalyses` al momento della
 * creazione/aggiunta. Quindi `remainingAnalyses` riflette già il consumo reale.
 *
 * Funzione PURA.
 *
 * @returns `coverage[i]` = id del pacchetto che copre la i-esima nuova analisi
 *          (o `null` se nessuno ha slot), e `decrements` = quante analisi
 *          scalare da ciascun pacchetto.
 */
export function assignPackageCoverage(
  packages: PackageSlot[],
  count: number,
): { coverage: (string | null)[]; decrements: Record<string, number> } {
  const remaining = new Map(packages.map((p) => [p.id, p.remainingAnalyses]));
  const decrements: Record<string, number> = {};
  const coverage: (string | null)[] = [];

  for (let i = 0; i < count; i++) {
    const pkg = packages.find((p) => (remaining.get(p.id) ?? 0) > 0);
    if (pkg) {
      coverage.push(pkg.id);
      remaining.set(pkg.id, (remaining.get(pkg.id) ?? 0) - 1);
      decrements[pkg.id] = (decrements[pkg.id] ?? 0) + 1;
    } else {
      coverage.push(null);
    }
  }

  return { coverage, decrements };
}
