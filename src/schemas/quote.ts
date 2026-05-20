import { z } from "zod";
import { zCents } from "./validators";
import { ClientSnapshotSchema } from "./client";

// ── Status preventivo ─────────────────────────────────────────────────
export const QuoteStatusSchema = z.enum([
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "cancelled",
]);
export type QuoteStatus = z.infer<typeof QuoteStatusSchema>;

// ── Voci preventivo (discriminated union per kind) ────────────────────
export const QuoteItemFreeSchema = z.object({
  kind: z.literal("free"),
  description: z.string().min(1, "Descrizione obbligatoria").max(500),
  quantity: z.number().min(0.01).max(100000),
  unitPriceCents: zCents,
});

export const QuoteItemAnalysisSchema = z.object({
  kind: z.literal("analysis"),
  analysisId: z.string().min(1),
  nameSnapshot: z.string(),
  description: z.string().max(500).optional(),
  quantity: z.number().min(0.01).max(100000),
  unitPriceCents: zCents,
});

export const QuoteItemPackageSchema = z.object({
  kind: z.literal("package"),
  packageId: z.string().min(1),
  nameSnapshot: z.string(),
  description: z.string().max(500).optional(),
  quantity: z.number().min(1).max(100000).int(),
  unitPriceCents: zCents,
});

export const QuoteItemSchema = z.discriminatedUnion("kind", [
  QuoteItemFreeSchema,
  QuoteItemAnalysisSchema,
  QuoteItemPackageSchema,
]);

export type QuoteItem = z.infer<typeof QuoteItemSchema>;

// ── Sconti e tasse ───────────────────────────────────────────────────
export const DiscountSchema = z.object({
  label: z.string().min(1, "Etichetta sconto obbligatoria").max(100),
  type: z.enum(["percent", "fixed"]),
  value: z.number().min(0),     // % o euro (convertito in cents nel calcolo)
});

export type Discount = z.infer<typeof DiscountSchema>;

export const TaxSchema = z.object({
  label: z.string().min(1).max(100),
  percent: z.number().min(0).max(100),
  applied: z.boolean(),
});

export type Tax = z.infer<typeof TaxSchema>;

// ── Condizioni di pagamento del preventivo ────────────────────────────
export const QuotePaymentTermsSchema = z.object({
  installmentsCount: z.number().int().min(1).max(60),
  firstDueDate: z.string().optional(),          // "YYYY-MM-DD"
  installmentPeriod: z.enum(["monthly", "biweekly", "custom"]),
  customInterval: z.number().int().min(1).optional(),
  customUnit: z.enum(["days", "months", "years"]).optional(),
  notes: z.string().max(1000).optional(),       // testo libero per il PDF
});

export type QuotePaymentTerms = z.infer<typeof QuotePaymentTermsSchema>;

// ── Form preventivo (creazione / modifica bozza) ──────────────────────
export const QuoteFormSchema = z.object({
  clientId: z.string().min(1, "Seleziona un cliente"),
  issuedAt: z.string().min(1, "Data emissione obbligatoria"),  // "YYYY-MM-DD"
  validUntil: z.string().optional(),                            // "YYYY-MM-DD"
  items: z.array(QuoteItemSchema).min(1, "Aggiungi almeno una voce"),
  discounts: z.array(DiscountSchema),
  taxes: z.array(TaxSchema),
  notes: z.string().max(3000).optional(),
  paymentTerms: QuotePaymentTermsSchema.optional(),
});

export type QuoteFormValues = z.infer<typeof QuoteFormSchema>;

// ── Documento Firestore preventivo ────────────────────────────────────
export const QuoteDocSchema = z.object({
  id: z.string(),
  number: z.string(),           // "2026/0001"
  year: z.number().int(),
  sequence: z.number().int(),
  clientId: z.string(),
  clientSnapshot: ClientSnapshotSchema,
  status: QuoteStatusSchema,
  issuedAt: z.any(),        // Timestamp
  validUntil: z.any().optional(),
  items: z.array(QuoteItemSchema),
  subtotalCents: zCents,
  discounts: z.array(DiscountSchema),
  taxes: z.array(TaxSchema),
  totalCents: zCents,
  notes: z.string().optional(),
  paymentTerms: QuotePaymentTermsSchema.optional(),
  pdfStorageRef: z.string().optional(),
  frozenSnapshot: z.any().optional(), // snapshot bloccato all'approvazione
  approvedAt: z.any().optional(),
  approvedBy: z.string().optional(),
  version: z.number().int().min(0),
  createdAt: z.any(),
  updatedAt: z.any(),
});

export type QuoteDoc = z.infer<typeof QuoteDocSchema>;

// ── Transizioni di stato consentite (§4.8) ────────────────────────────
export const ALLOWED_QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "rejected", "cancelled"],
  approved: [],
  rejected: [],
  cancelled: [],
};

export function isQuoteTransitionAllowed(
  from: QuoteStatus,
  to: QuoteStatus,
): boolean {
  return ALLOWED_QUOTE_TRANSITIONS[from]?.includes(to) ?? false;
}
