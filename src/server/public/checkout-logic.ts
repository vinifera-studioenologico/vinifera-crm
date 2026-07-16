/**
 * Logica pura del checkout — nessuna dipendenza da Firestore/Stripe/server-only.
 * Importabile dai test Vitest senza side-effects server.
 */
import { isFreeEvent } from "@/lib/events/status";

export function isHoneypot(website: string | undefined): boolean {
  return !!website && website.trim() !== "";
}

export type CheckoutBranch = "free" | "payment";

export function chooseCheckoutBranch(ev: { priceCents: number }): CheckoutBranch {
  return isFreeEvent({ priceCents: ev.priceCents }) ? "free" : "payment";
}

export type BillingValidationError =
  | "billing_required_for_paid_event"
  | "billing_forbidden_for_free_event";

export function validateBillingPresence(
  branch: CheckoutBranch,
  hasBilling: boolean,
): BillingValidationError | null {
  if (branch === "payment" && !hasBilling) return "billing_required_for_paid_event";
  if (branch === "free" && hasBilling) return "billing_forbidden_for_free_event";
  return null;
}

export function validateMaxSeatsPerOrder(
  maxSeatsPerOrder: number | null,
  seats: number,
): boolean {
  if (maxSeatsPerOrder === null) return true;
  return seats <= maxSeatsPerOrder;
}

export function computeOrderAmounts(
  ev: { priceCents: number; discountedPriceCents: number | null },
  seats: number,
): { unitPriceCents: number; totalCents: number } {
  const unitPriceCents = ev.discountedPriceCents ?? ev.priceCents;
  const totalCents = unitPriceCents * seats; // cents × int — nessun float
  return { unitPriceCents, totalCents };
}

// Duck-typed Timestamp: compatibile con firebase-admin Timestamp e con oggetti test
type TimestampLike = { toMillis(): number };

export function shouldResumePendingOrder(
  order: { status: string; holdExpiresAt: TimestampLike | null },
  now: Date,
): boolean {
  if (order.status !== "pending_payment") return false;
  if (!order.holdExpiresAt) return false;
  return order.holdExpiresAt.toMillis() > now.getTime() + 60_000;
}
