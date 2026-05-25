import { z } from "zod";
import { zCents, zEurInput } from "./validators";

// ── Status pagamento ──────────────────────────────────────────────────
export const PaymentStatusSchema = z.enum([
  "pending",
  "partial",
  "paid",
  "overdue",
  "cancelled",
]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

// ── Status rata ───────────────────────────────────────────────────────
export const InstallmentStatusSchema = z.enum([
  "pending",
  "paid",
  "overdue",
  "cancelled",
]);
export type InstallmentStatus = z.infer<typeof InstallmentStatusSchema>;

// ── Metodi di pagamento ───────────────────────────────────────────────
export const PaymentMethodSchema = z.enum([
  "cash",
  "bank_transfer",
  "card",
  "other",
]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

// ── Tipi transazione ──────────────────────────────────────────────────
export const TransactionTypeSchema = z.enum([
  "payment",
  "refund",
  "adjustment",
  "cancellation",
]);
export type TransactionType = z.infer<typeof TransactionTypeSchema>;

// ── Sorgente pagamento ────────────────────────────────────────────────
export const PaymentSourceSchema = z.object({
  kind: z.enum(["sample", "package", "manual"]),
  refId: z.string().optional(),
  sampleCode: z.string().optional(),
});
export type PaymentSource = z.infer<typeof PaymentSourceSchema>;

// ── Form nuovo pagamento (usato anche da createSample e clientPackage) ─
export const PaymentFormSchema = z.object({
  clientId: z.string().min(1, "Cliente obbligatorio"),
  source: PaymentSourceSchema,
  description: z.string().min(1, "Descrizione obbligatoria").max(500),
  totalAmountCents: zEurInput,
  installmentsCount: z
    .number({ error: "Inserire un numero" })
    .int()
    .min(1, "Almeno 1 rata")
    .max(60, "Massimo 60 rate"),
  firstDueDate: z.string().min(1, "Data prima scadenza obbligatoria"), // "YYYY-MM-DD"
  installmentPeriod: z.enum(["monthly", "biweekly", "custom"]),
  customInterval: z.number().int().min(1).optional(),
  customUnit: z.enum(["days", "months", "years"]).optional(),
  accontoCents: z.preprocess(
    (val) => (val === "" || val === null ? undefined : val),
    zEurInput.optional(),
  ), // acconto già incassato — crea rata 0 già pagata
  accontoDate: z.string().optional(),  // "YYYY-MM-DD" — data pagamento acconto
  notes: z.string().max(1000).optional(),
});

export type PaymentFormValues = z.infer<typeof PaymentFormSchema>;

// ── Form "Segna pagato" (su rata) ─────────────────────────────────────
export const MarkInstallmentPaidSchema = z.object({
  paymentId: z.string(),
  installmentId: z.string(),
  paidAmountCents: zEurInput,
  method: PaymentMethodSchema,
  paidAt: z.string().min(1, "Data pagamento obbligatoria"), // "YYYY-MM-DD"
  note: z.string().max(500).optional(),
});

export type MarkInstallmentPaidValues = z.infer<typeof MarkInstallmentPaidSchema>;

// ── Documento Firestore pagamento ─────────────────────────────────────
export const PaymentDocSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  source: PaymentSourceSchema,
  description: z.string(),
  totalAmountCents: zCents,
  paidAmountCents: zCents,
  status: PaymentStatusSchema,
  installmentsCount: z.number().int().min(1),
  version: z.number().int().min(0),
  createdAt: z.any(),
  updatedAt: z.any(),
  deletedAt: z.any().nullable(),
});

export type PaymentDoc = z.infer<typeof PaymentDocSchema>;

// ── Documento Firestore rata ──────────────────────────────────────────
export const InstallmentDocSchema = z.object({
  id: z.string(),
  index: z.number().int().min(1),
  dueDate: z.any(),           // Timestamp (23:59:59.999 Rome — §18.4)
  amountCents: zCents,
  status: InstallmentStatusSchema,
  paidAt: z.any().optional(),
  paidAmountCents: zCents.optional(),
  method: PaymentMethodSchema.optional(),
  note: z.string().optional(),
  createdAt: z.any(),
  updatedAt: z.any(),
});

export type InstallmentDoc = z.infer<typeof InstallmentDocSchema>;

// ── Documento Firestore transazione (immutabile) ──────────────────────
export const TransactionDocSchema = z.object({
  id: z.string(),
  installmentId: z.string().optional(),
  type: TransactionTypeSchema,
  amountCents: zCents,
  date: z.any(),              // Timestamp
  method: z.string().optional(),
  note: z.string().optional(),
  performedBy: z.string(),        // uid
  createdAt: z.any(),
});

export type TransactionDoc = z.infer<typeof TransactionDocSchema>;
