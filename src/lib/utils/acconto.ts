import { splitInCents } from "@/lib/utils/money";

/**
 * Logica acconto (rata 0 già pagata) condivisa da:
 *   - server/actions/clientPackages.ts (purchasePackage)
 *   - server/actions/samples.ts (createSample)
 *   - server/actions/payments.ts (createManualPayment)
 *   - server/actions/quotes.ts (approveQuoteWithPayment)
 *
 * Funzione PURA — nessuna dipendenza da Firestore.
 */
export interface AccontoPlan {
  hasAcconto: boolean;
  remaining: number;
  isFullyPaid: boolean;
  paidAmountCents: number;
  status: "pending" | "partial" | "paid";
  /** Include la rata 0 (acconto) se presente. */
  installmentsCount: number;
  /** Rate ordinarie sul residuo — vuoto se `isFullyPaid`. */
  amounts: number[];
}

export function computeAccontoPlan(input: {
  totalCents: number;
  accontoCents: number;
  installmentsCount: number;
}): AccontoPlan {
  const { totalCents, accontoCents, installmentsCount: count } = input;
  const hasAcconto = accontoCents > 0 && count > 1;
  const remaining = hasAcconto ? Math.max(0, totalCents - accontoCents) : totalCents;
  const isFullyPaid = hasAcconto && remaining === 0;

  const paidAmountCents = hasAcconto ? (isFullyPaid ? totalCents : accontoCents) : 0;
  const status: AccontoPlan["status"] = hasAcconto
    ? isFullyPaid
      ? "paid"
      : "partial"
    : "pending";
  const resultInstallmentsCount = hasAcconto ? (isFullyPaid ? 1 : count + 1) : count;
  const amounts = isFullyPaid ? [] : splitInCents(remaining, count);

  return {
    hasAcconto,
    remaining,
    isFullyPaid,
    paidAmountCents,
    status,
    installmentsCount: resultInstallmentsCount,
    amounts,
  };
}
