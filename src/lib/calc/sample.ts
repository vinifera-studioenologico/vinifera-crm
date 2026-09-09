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
  /**
   * Se presente, questo slot copre SOLO l'analisi con questo id — è un
   * "credito da preventivo" (§ docs/crediti-da-preventivo.md). Assente per
   * un pacchetto commerciale classico, che copre qualsiasi analisi.
   */
  restrictedToAnalysisId?: string | null;
}

/**
 * Sceglie lo slot da usare per UNA analisi, secondo questo ordine:
 *   1. un credito ristretto a QUESTA analisi (ha priorità: è già stato
 *      pagato specificamente per lei — consumarlo per ultimo lo lascerebbe
 *      inutilizzato mentre l'analisi viene ripagata altrove);
 *   2. un pacchetto generico (nessuna restrizione);
 *   3. nessuno (`null`) → l'analisi resta a pagamento.
 *
 * Un credito ristretto NON copre mai un'analisi diversa da quella per cui
 * è nato: è l'invariante principale dei crediti da preventivo.
 *
 * `packages` deve già essere ordinato FIFO (più vecchio prima) da chi chiama.
 * `remainingByPkg` riflette gli slot ancora liberi, incluse le assegnazioni
 * già fatte in questa stessa chiamata/transazione.
 *
 * Funzione PURA.
 */
export function pickSlotForAnalysis(
  packages: PackageSlot[],
  analysisId: string,
  remainingByPkg: Map<string, number>,
): string | null {
  const free = (p: PackageSlot) => (remainingByPkg.get(p.id) ?? 0) > 0;
  return (
    packages.find((p) => p.restrictedToAnalysisId === analysisId && free(p))?.id ??
    packages.find((p) => !p.restrictedToAnalysisId && free(p))?.id ??
    null
  );
}

/**
 * Assegna la copertura da pacchetto/credito a un elenco di nuove analisi
 * aggiunte a un campione (nuovo o esistente). Consuma gli slot secondo
 * l'ordine di `pickSlotForAnalysis`, applicato analisi per analisi.
 *
 * IMPORTANTE: non considera gli item già presenti nel campione — i loro slot
 * sono già stati scalati dal contatore `remainingAnalyses` al momento della
 * creazione/aggiunta. Quindi `remainingAnalyses` riflette già il consumo reale.
 *
 * Funzione PURA.
 *
 * @param packages già ordinati FIFO (più vecchio prima) da chi chiama.
 * @param analysisIds l'id dell'analisi di ciascuna nuova riga, nello stesso
 *        ordine in cui compariranno nel campione.
 * @returns `coverage[i]` = id del pacchetto/credito che copre la i-esima
 *          nuova analisi (o `null` se nessuno ha slot compatibili), e
 *          `decrements` = quante analisi scalare da ciascun pacchetto/credito.
 */
export function assignPackageCoverage(
  packages: PackageSlot[],
  analysisIds: string[],
): { coverage: (string | null)[]; decrements: Record<string, number> } {
  const remaining = new Map(packages.map((p) => [p.id, p.remainingAnalyses]));
  const decrements: Record<string, number> = {};
  const coverage: (string | null)[] = [];

  for (const analysisId of analysisIds) {
    const pkgId = pickSlotForAnalysis(packages, analysisId, remaining);
    coverage.push(pkgId);
    if (pkgId) {
      remaining.set(pkgId, (remaining.get(pkgId) ?? 0) - 1);
      decrements[pkgId] = (decrements[pkgId] ?? 0) + 1;
    }
  }

  return { coverage, decrements };
}
