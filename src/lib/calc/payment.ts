/**
 * §18.3 §18.7 — Derivazione stato pagamento.
 * Funzione PURA. Usata sia server (Server Action) che client (display).
 */

export type PaymentStatus = "pending" | "partial" | "paid" | "overdue" | "cancelled";
export type InstallmentStatus = "pending" | "paid" | "overdue" | "cancelled";

export interface InstallmentForCalc {
  status: InstallmentStatus;
  dueDate: Date; // già convertita in Date JS
  amountCents: number;
  paidAmountCents?: number;
}

export interface PaymentForCalc {
  totalAmountCents: number;
  paidAmountCents: number;
  cancelled: boolean;
}

/**
 * Deriva lo stato del pagamento dagli installments.
 * §18.7: è l'unica funzione autorizzata a calcolare payments.status.
 */
export function derivePaymentStatus(
  payment: PaymentForCalc,
  installments: InstallmentForCalc[],
  now: Date = new Date(),
): PaymentStatus {
  if (payment.cancelled) return "cancelled";

  if (payment.paidAmountCents >= payment.totalAmountCents) return "paid";

  const hasOverdue = installments.some(
    (inst) =>
      inst.status === "overdue" ||
      (inst.status === "pending" && inst.dueDate < now),
  );
  if (hasOverdue) return "overdue";

  if (payment.paidAmountCents > 0) return "partial";

  return "pending";
}

/**
 * Calcola paidAmountCents di un pagamento come somma delle transazioni.
 */
export function computePaidAmount(
  transactions: Array<{ type: "payment" | "refund" | "adjustment" | "cancellation"; amountCents: number }>,
): number {
  return transactions.reduce((acc, t) => {
    if (t.type === "payment") return acc + t.amountCents;
    if (t.type === "refund") return acc - t.amountCents;
    return acc;
  }, 0);
}
