/**
 * Normalizzatori per email e telefono — usati in eventOrders e eventSubscribers
 * per matching cross-ordine (storico acquirenti) e dedup iscritti.
 */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Restituisce solo le cifre del numero di telefono, con il prefisso IT (+39 / 0039)
 * rimosso quando presente, così che "+39 333 1234567", "3331234567" e "0039333 1234567"
 * producano tutti la stessa stringa normalizzata.
 */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");

  // Rimuovi prefisso "0039" (es. "0039333...")
  if (digits.startsWith("0039") && digits.length > 10) {
    digits = digits.slice(4);
    return digits;
  }
  // Rimuovi prefisso "39" (es. da "+39 333...")
  if (digits.startsWith("39") && digits.length > 10) {
    digits = digits.slice(2);
  }
  return digits;
}
