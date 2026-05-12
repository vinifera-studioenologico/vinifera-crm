/**
 * Money utilities — §18.1: tutti gli importi in CENTESIMI interi.
 * MAI usare +/-/* su importi senza passare da queste utility.
 */

const LOCALE = "it-IT";
const CURRENCY = "EUR";

/**
 * Converte un input umano (stringa "12,50" o "12.50" o numero) in centesimi interi.
 */
export function toCents(input: string | number): number {
  if (typeof input === "number") {
    return Math.round(input * 100);
  }
  // Normalizza separatori: "1.234,56" → "1234.56"
  const normalized = input
    .trim()
    .replace(/\./g, "") // rimuovi separatori migliaia (punto in it-IT)
    .replace(",", "."); // virgola decimale → punto
  const n = parseFloat(normalized);
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
}

/**
 * Converte centesimi in numero decimale (usare SOLO per display/calcolo intermedio).
 */
export function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Formatta centesimi come stringa valuta italiana: "1.234,56 €"
 */
export function formatEUR(cents: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
  }).format(fromCents(cents));
}

/**
 * Applica una percentuale a un importo in centesimi. Restituisce centesimi interi.
 * Esempio: applyPercentCents(10000, 22) → 2200
 */
export function applyPercentCents(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

export function addCents(a: number, b: number): number {
  return a + b;
}

export function subCents(a: number, b: number): number {
  return a - b;
}

/**
 * Moltiplica centesimi per una quantità intera.
 * Esempio: mulCentsByQty(150, 3) → 450
 */
export function mulCentsByQty(unitCents: number, qty: number): number {
  return Math.round(unitCents * qty);
}

/**
 * Divide `totalCents` in `n` rate il più possibile uguali.
 * Le prime `remainder` rate hanno 1 centesimo in più per garantire:
 * sum(result) === totalCents SEMPRE.
 *
 * §18.2: invariante testata in unit test.
 */
export function splitInCents(totalCents: number, n: number): number[] {
  if (n <= 0) throw new Error("n deve essere >= 1");
  if (n === 1) return [totalCents];

  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;

  return Array.from({ length: n }, (_, i) => (i < remainder ? base + 1 : base));
}
