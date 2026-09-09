import type { QuoteItem } from "@/schemas/quote";

/**
 * Bozza di un credito da generare per una riga di preventivo approvata.
 * Diventerà un `ClientPackageDoc` con `origin: "quote"` e
 * `restrictedToAnalysisId` — vedi docs/crediti-da-preventivo.md.
 */
export interface QuoteCreditDraft {
  analysisId: string;
  analysisNameSnapshot: string;
  /** Intero ≥ 1 — diventa `totalAnalyses`/`remainingAnalyses` del credito. */
  quantity: number;
  /** unitPriceCents × quantity — valore indicativo per la UI, non contabile. */
  totalPriceCents: number;
}

/**
 * Estrae i crediti da generare dalle righe di un preventivo approvato.
 *
 * Solo le righe `kind: "analysis"` con quantità intera ≥ 1 generano un
 * credito (decisione di prodotto: un conteggio di analisi da scalare non
 * può essere frazionario). Le righe `kind: "free"` e `kind: "package"` non
 * generano credito qui: la seconda è già gestita da `purchasePackage`.
 *
 * Una riga = un credito: righe duplicate sulla stessa analisi NON si
 * fondono in un unico credito — ognuna conserva il prezzo della propria
 * riga. Il consumo (FIFO, in ordine di creazione) le userà comunque in
 * sequenza, quindi il comportamento verso il cliente è identico.
 *
 * Funzione PURA.
 */
export function deriveQuoteCredits(items: QuoteItem[]): QuoteCreditDraft[] {
  const credits: QuoteCreditDraft[] = [];

  for (const item of items) {
    if (item.kind !== "analysis") continue;
    if (!Number.isInteger(item.quantity) || item.quantity < 1) continue;

    credits.push({
      analysisId: item.analysisId,
      analysisNameSnapshot: item.nameSnapshot,
      quantity: item.quantity,
      totalPriceCents: Math.round(item.unitPriceCents * item.quantity),
    });
  }

  return credits;
}
