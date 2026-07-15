/**
 * Funzioni pure per lo stato pubblico degli eventi.
 * Nessuna dipendenza da Firebase/server: usabili in test, client e server.
 */

export type PublicEventStatus =
  | "upcoming"
  | "bookable"
  | "sold_out"
  | "past"
  | "cancelled";

// Duck-typing compatibile con firebase-admin Timestamp e con Date plain.
type DateLike = Date | { toDate(): Date };

function toDate(v: DateLike | null | undefined): Date | null {
  if (!v) return null;
  return v instanceof Date ? v : v.toDate();
}

interface EventForStatus {
  status: "draft" | "published" | "cancelled";
  startsAt: DateLike;
  endsAt: DateLike | null;
  bookingOpensAt: DateLike | null;
  bookingClosesAt: DateLike | null;
  capacity: number;
  seatsSold: number;
  seatsHeld: number;
}

/**
 * Deriva lo stato pubblico dell'evento in modo sincrono e senza I/O.
 * Restituisce `null` se l'evento è in `draft` (non è pubblico).
 *
 * Ordine di valutazione:
 * cancelled → "cancelled"
 * now > (endsAt ?? startsAt) → "past"
 * bookingOpensAt && now < bookingOpensAt → "upcoming"
 * bookingClosesAt && now > bookingClosesAt → "past"
 * seatsAvailable <= 0 → "sold_out"
 * → "bookable"
 */
export function derivePublicStatus(
  ev: EventForStatus,
  now: Date,
): PublicEventStatus | null {
  if (ev.status === "draft") return null;
  if (ev.status === "cancelled") return "cancelled";

  const startsAt = toDate(ev.startsAt)!;
  const endsAt = toDate(ev.endsAt);
  const bookingOpensAt = toDate(ev.bookingOpensAt);
  const bookingClosesAt = toDate(ev.bookingClosesAt);

  const eventEnd = endsAt ?? startsAt;
  if (now > eventEnd) return "past";

  if (bookingOpensAt && now < bookingOpensAt) return "upcoming";

  if (bookingClosesAt && now > bookingClosesAt) return "past";

  if (seatsAvailable(ev) <= 0) return "sold_out";

  return "bookable";
}

/**
 * Posti disponibili effettivi (può essere negativo in caso di overbooking).
 * Nel DTO pubblico va clampato a >= 0.
 */
export function seatsAvailable(ev: {
  capacity: number;
  seatsSold: number;
  seatsHeld: number;
}): number {
  return ev.capacity - ev.seatsSold - ev.seatsHeld;
}

/**
 * Discriminante unica per il flusso gratuito vs a pagamento.
 * Usare SEMPRE questa funzione, mai confronti inline su priceCents.
 */
export function isFreeEvent(ev: { priceCents: number }): boolean {
  return ev.priceCents === 0;
}

/**
 * Eccedenza di overbooking dopo una riduzione di capienza.
 * Restituisce `null` se non c'è overbooking (occupied <= capacity).
 */
export function computeOverbookExcess(occupied: number, capacity: number): number | null {
  return occupied > capacity ? occupied - capacity : null;
}
