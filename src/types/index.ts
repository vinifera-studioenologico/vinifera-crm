/**
 * Tipi TypeScript del dominio — derivati dagli schema Zod (unica fonte di verità).
 * Non ridefinire questi tipi manualmente: usare z.infer sui rispettivi schema.
 */

// ── Entità core ───────────────────────────────────────────────────────
export type {
  ClientFormValues,
  ClientDoc,
  ClientSnapshot,
  CompanySettingsValues,
} from "@/schemas/client";

export type { Address } from "@/schemas/validators";

export type {
  AnalysisFormValues,
  AnalysisDoc,
  AnalysisSnapshot,
} from "@/schemas/analysis";

export type {
  PackageFormValues,
  PackageDoc,
  ClientPackageFormValues,
  ClientPackageDoc,
  ClientPackageStatus,
} from "@/schemas/package";

export type {
  SampleStatus,
  SampleItem,
  SampleNote,
  SampleBaseFormValues,
  SampleItemsFormValues,
  SamplePaymentFormValues,
  SampleFormValues,
  SampleDoc,
} from "@/schemas/sample";

export type {
  QuoteStatus,
  QuoteItem,
  Discount,
  Tax,
  QuoteFormValues,
  QuoteDoc,
} from "@/schemas/quote";

export type {
  PaymentStatus,
  InstallmentStatus,
  PaymentMethod,
  TransactionType,
  PaymentSource,
  PaymentFormValues,
  MarkInstallmentPaidValues,
  PaymentDoc,
  InstallmentDoc,
  TransactionDoc,
} from "@/schemas/payment";

export type {
  ReportDoc,
  ReportFormValues,
} from "@/schemas/report";

export type {
  ReminderStatus,
  ReminderRelated,
  Recurrence,
  ReminderFormValues,
  ReminderDoc,
} from "@/schemas/reminder";

// ── Tipi utility ──────────────────────────────────────────────────────

/** Risultato generico di una Server Action */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/** Pagina paginata (cursor-based — §18.20) */
export type PaginatedResult<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type {
  ExpenseCategory,
  ExpenseFormValues,
  ExpenseDoc,
  FixedCostFrequency,
  FixedCostFormValues,
  FixedCostDoc,
  KitFormValues,
  KitDoc,
  CostsSettingsValues,
  KitImportLineValues,
  KitOfferExpenseValues,
  KitOfferImportValues,
} from "@/schemas/cost";
