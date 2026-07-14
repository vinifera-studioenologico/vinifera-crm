/**
 * Logica pura per le transizioni di stato degli iscritti alla mailing list.
 * Nessuna dipendenza da Firestore — testabile con Vitest.
 */

export type SubscriberStatus = "pending" | "active" | "unsubscribed";

export type SubscribeDecision =
  | { action: "create_new" }
  | { action: "resend_confirm" }
  | { action: "re_subscribe" }
  | { action: "noop_already_active" };

/**
 * Decide l'azione da intraprendere in base allo stato attuale dell'iscritto.
 * @param existingStatus null = non esiste ancora
 */
export function decideSubscribeAction(
  existingStatus: SubscriberStatus | null,
): SubscribeDecision {
  if (existingStatus === null) return { action: "create_new" };
  if (existingStatus === "pending") return { action: "resend_confirm" };
  if (existingStatus === "unsubscribed") return { action: "re_subscribe" };
  return { action: "noop_already_active" }; // active
}

/**
 * Decide se inviare la notifica "nuovo evento prenotabile" alla mailing list.
 * Restituisce true solo se subscribersNotifiedAt è null (non ancora inviato).
 */
export function shouldNotifySubscribers(subscribersNotifiedAt: unknown): boolean {
  return subscribersNotifiedAt === null || subscribersNotifiedAt === undefined;
}
