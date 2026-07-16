/**
 * Logica pura per le operazioni di rimborso/cancellazione eventi.
 * Nessuna dipendenza da Firestore/Stripe — testabile con Vitest.
 */

export interface OrderForCancellation {
  id: string;
  status: string;
  paymentIntentId: string | null;
  totalCents: number;
  seats: number;
  locale: "it" | "en";
  buyer: {
    email: string;
    emailNormalized: string;
    firstName: string;
    lastName: string;
  };
}

export interface CancellationPlan {
  /** Ordini paid con PaymentIntent → Stripe refund */
  paidPaid: OrderForCancellation[];
  /** Ordini paid senza PaymentIntent (gratuiti) → cancel diretto */
  paidFree: OrderForCancellation[];
  /** Ordini pending_payment con PaymentIntent → cancel PI + expired */
  pendingPaid: OrderForCancellation[];
  /** Ordini già terminali (refunded/cancelled/failed/expired) → skip */
  skip: OrderForCancellation[];
}

/**
 * Categorizza gli ordini di un evento per il flusso di cancellazione.
 * Restituisce i 4 bucket con ruoli distinti.
 */
export function categorizeOrdersForCancellation(
  orders: OrderForCancellation[],
): CancellationPlan {
  const plan: CancellationPlan = {
    paidPaid: [],
    paidFree: [],
    pendingPaid: [],
    skip: [],
  };

  for (const order of orders) {
    if (order.status === "paid") {
      if (order.paymentIntentId) {
        plan.paidPaid.push(order);
      } else {
        plan.paidFree.push(order);
      }
    } else if (order.status === "pending_payment") {
      if (order.paymentIntentId) {
        plan.pendingPaid.push(order);
      }
      // pending senza PI non dovrebbe esistere, skip silenzioso
    } else {
      // refunded, cancelled, failed, expired → skip
      plan.skip.push(order);
    }
  }

  return plan;
}

/**
 * Calcola il totale da rimborsare (solo ordini a pagamento paid).
 */
export function computeTotalRefundCents(plan: CancellationPlan): number {
  return plan.paidPaid.reduce((sum, o) => sum + o.totalCents, 0);
}

/**
 * Deduplicazione destinatari "Notifica tutti".
 * Ritorna un array con un solo record per emailNormalized
 * (il primo incontrato, in ordine di input).
 * Include solo ordini `paid`.
 */
export function deduplicateBuyerEmails(
  orders: OrderForCancellation[],
): Array<{ email: string; emailNormalized: string; firstName: string; locale: "it" | "en" }> {
  const seen = new Set<string>();
  const result: Array<{ email: string; emailNormalized: string; firstName: string; locale: "it" | "en" }> = [];

  for (const order of orders) {
    if (order.status !== "paid") continue;
    if (seen.has(order.buyer.emailNormalized)) continue;
    seen.add(order.buyer.emailNormalized);
    result.push({
      email: order.buyer.email,
      emailNormalized: order.buyer.emailNormalized,
      firstName: order.buyer.firstName,
      locale: order.locale,
    });
  }

  return result;
}
