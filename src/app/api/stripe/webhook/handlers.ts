/**
 * Funzioni pure per le decisioni del webhook Stripe.
 * Nessuna dipendenza da Firestore/Stripe — testabili con Vitest.
 * La route `/api/stripe/webhook` fa solo I/O; la logica è qui.
 */

// ── Tipi input ────────────────────────────────────────────────────────
export interface OrderSnapshot {
  id: string;
  status: "pending_payment" | "paid" | "expired" | "refunded" | "failed" | "cancelled";
  seats: number;
  paymentIntentId: string | null;
  eventId: string;
  locale: "it" | "en";
  buyer: {
    firstName: string;
    lastName: string;
    email: string;
  };
  eventSnapshot: {
    titleIt: string;
    startsAt: unknown; // Timestamp
    locationName: string;
  };
  orderNumber: string;
  totalCents: number;
  billing: unknown;
}

export interface EventSeats {
  capacity: number;
  seatsSold: number;
  seatsHeld: number;
}

// ── Tipi output ───────────────────────────────────────────────────────
export type SideEffectType =
  | { type: "send_confirmation_email" }
  | { type: "auto_refund"; paymentIntentId: string }
  | { type: "send_refund_email_sold_out" }
  | { type: "trigger_revalidation" }
  | { type: "notify_admin_paid" }
  | { type: "log_transaction"; txType: string; amountCents: number | null; summary: string; stripeEventId: string };

export interface DecisionResult {
  /** null = nessuna scrittura su ordine (no-op) */
  orderPatch: Record<string, unknown> | null;
  /** null = nessuna scrittura su evento (no-op) */
  eventPatch: Record<string, unknown> | null;
  sideEffects: SideEffectType[];
}

// ── payment_intent.succeeded ──────────────────────────────────────────
export function decidePaymentIntentSucceeded(
  order: OrderSnapshot,
  eventSeats: EventSeats,
  stripeEventId: string,
  amount: number,
  now: Date,
): DecisionResult {
  // Guardia: ordini gratuiti non transitano MAI da qui
  if (order.paymentIntentId === null) {
    return { orderPatch: null, eventPatch: null, sideEffects: [] };
  }

  // Idempotente: già paid
  if (order.status === "paid") {
    return {
      orderPatch: null,
      eventPatch: null,
      sideEffects: [
        { type: "log_transaction", txType: "succeeded_noop", amountCents: amount, summary: "Evento già gestito (idempotente)", stripeEventId },
      ],
    };
  }

  // Idempotente: già refunded o failed
  if (order.status === "refunded" || order.status === "failed") {
    return { orderPatch: null, eventPatch: null, sideEffects: [] };
  }

  // Percorso normale: pending_payment → paid
  if (order.status === "pending_payment") {
    return {
      orderPatch: { status: "paid", paidAt: now },
      eventPatch: {
        seatsHeld_dec: order.seats, // decrementa seatsHeld
        seatsSold_inc: order.seats, // incrementa seatsSold
      },
      sideEffects: [
        { type: "log_transaction", txType: "succeeded", amountCents: amount, summary: "Pagamento completato", stripeEventId },
        { type: "send_confirmation_email" },
        { type: "trigger_revalidation" },
        { type: "notify_admin_paid" },
      ],
    };
  }

  // Pagamento arrivato dopo scadenza (stato expired)
  if (order.status === "expired") {
    const available = eventSeats.capacity - eventSeats.seatsSold - eventSeats.seatsHeld;
    if (available >= order.seats) {
      // Recovery: i posti ci sono ancora → conferma l'ordine
      return {
        orderPatch: { status: "paid", paidAt: now },
        eventPatch: { seatsSold_inc: order.seats },
        sideEffects: [
          { type: "log_transaction", txType: "succeeded_recovery", amountCents: amount, summary: "Pagamento in ritardo recuperato", stripeEventId },
          { type: "send_confirmation_email" },
          { type: "trigger_revalidation" },
        ],
      };
    }
    // I posti sono esauriti → rimborso automatico
    return {
      orderPatch: null, // resta expired
      eventPatch: null,
      sideEffects: [
        { type: "log_transaction", txType: "succeeded_auto_refund", amountCents: amount, summary: "Pagamento ricevuto ma evento esaurito — rimborso automatico", stripeEventId },
        { type: "auto_refund", paymentIntentId: order.paymentIntentId! },
        { type: "send_refund_email_sold_out" },
      ],
    };
  }

  return { orderPatch: null, eventPatch: null, sideEffects: [] };
}

// ── payment_intent.payment_failed ────────────────────────────────────
export function decidePaymentIntentFailed(
  order: OrderSnapshot,
  stripeEventId: string,
  errorMessage: string | null,
): DecisionResult {
  if (order.paymentIntentId === null) {
    return { orderPatch: null, eventPatch: null, sideEffects: [] };
  }
  // Solo log — l'utente può ritentare finché il countdown è in corso
  return {
    orderPatch: null,
    eventPatch: null,
    sideEffects: [
      {
        type: "log_transaction",
        txType: "payment_failed",
        amountCents: null,
        summary: errorMessage ? `Pagamento fallito: ${errorMessage}` : "Pagamento fallito",
        stripeEventId,
      },
    ],
  };
}

// ── payment_intent.canceled ───────────────────────────────────────────
export function decidePaymentIntentCanceled(
  order: OrderSnapshot,
  stripeEventId: string,
): DecisionResult {
  if (order.paymentIntentId === null) {
    return { orderPatch: null, eventPatch: null, sideEffects: [] };
  }

  // Idempotente: già expired o failed
  if (order.status === "expired" || order.status === "failed") {
    return { orderPatch: null, eventPatch: null, sideEffects: [] };
  }

  // pending_payment → failed + rilascio seatsHeld
  if (order.status === "pending_payment") {
    return {
      orderPatch: { status: "failed" },
      eventPatch: { seatsHeld_dec: order.seats },
      sideEffects: [
        {
          type: "log_transaction",
          txType: "canceled",
          amountCents: null,
          summary: "PaymentIntent cancellato (dashboard o scadenza)",
          stripeEventId,
        },
      ],
    };
  }

  return { orderPatch: null, eventPatch: null, sideEffects: [] };
}

// ── charge.refunded ───────────────────────────────────────────────────
export function decideChargeRefunded(
  order: OrderSnapshot,
  stripeEventId: string,
  refundId: string,
  amountCents: number,
): DecisionResult {
  if (order.paymentIntentId === null) {
    return { orderPatch: null, eventPatch: null, sideEffects: [] };
  }

  // Idempotente: già refunded
  if (order.status === "refunded") {
    return { orderPatch: null, eventPatch: null, sideEffects: [] };
  }

  // paid → refunded
  if (order.status === "paid") {
    return {
      orderPatch: { status: "refunded", refundedAt: new Date(), refundId },
      eventPatch: { seatsSold_dec: order.seats },
      sideEffects: [
        {
          type: "log_transaction",
          txType: "refunded",
          amountCents,
          summary: `Rimborso ricevuto (${refundId})`,
          stripeEventId,
        },
        { type: "trigger_revalidation" },
      ],
    };
  }

  return { orderPatch: null, eventPatch: null, sideEffects: [] };
}
