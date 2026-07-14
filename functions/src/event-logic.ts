/**
 * Logica pura per checkEvents — nessuna dipendenza da Firestore/Stripe.
 * Estratta per permettere la verifica con emulatore senza I/O (spec M5).
 */

// ── computeNextOccurrence ─────────────────────────────────────────────
/** Calcola la prossima data di occorrenza a partire da `base`. */
export function computeNextOccurrence(
  base: Date,
  rule: "daily" | "weekly" | "monthly" | "yearly",
  interval: number,
): Date {
  const d = new Date(base);
  switch (rule) {
    case "daily":
      d.setDate(d.getDate() + interval);
      break;
    case "weekly":
      d.setDate(d.getDate() + interval * 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + interval);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + interval);
      break;
  }
  return d;
}

// ── shouldReleaseHold ─────────────────────────────────────────────────
/**
 * Restituisce true se l'hold è scaduto tenendo conto del grace period.
 * Grace period serve per dare al webhook M4 il tempo di ricevere il
 * payment_intent.succeeded prima che il hold venga forzatamente scaduto.
 */
export function shouldReleaseHold(
  holdExpiresAt: Date,
  now: Date,
  graceSeconds: number = 90,
): boolean {
  return holdExpiresAt.getTime() <= now.getTime() - graceSeconds * 1000;
}

// ── buildNewEventSlug ─────────────────────────────────────────────────
/**
 * Genera lo slug per la nuova istanza ricorrente.
 * Formato: `{slug-base}-{YYYY-MM-DD}` dove la data è quella del nuovo startsAt.
 */
export function buildNewEventSlug(baseSlug: string, newStartsAt: Date): string {
  const y = newStartsAt.getFullYear();
  const m = String(newStartsAt.getMonth() + 1).padStart(2, "0");
  const d = String(newStartsAt.getDate()).padStart(2, "0");
  // Rimuovi eventuale data precedente dallo slug (pattern -YYYY-MM-DD in fondo)
  const cleanBase = baseSlug.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  return `${cleanBase}-${y}-${m}-${d}`;
}

// ── shiftTimestamp ────────────────────────────────────────────────────
/**
 * Aggiunge lo stesso delta di startsAt a una data opzionale
 * (usato per shiftare bookingOpensAt e bookingClosesAt nella stessa proporzione).
 */
export function shiftDate(
  date: Date | null,
  deltaMs: number,
): Date | null {
  if (!date) return null;
  return new Date(date.getTime() + deltaMs);
}
