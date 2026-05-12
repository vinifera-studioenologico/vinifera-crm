import { z } from "zod";
import { zNonEmptyString, zCents } from "./validators";

// ── Status campione ───────────────────────────────────────────────────
export const SampleStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);
export type SampleStatus = z.infer<typeof SampleStatusSchema>;

// ── Riga di analisi nel campione ───────────────────────────────────────
export const SampleItemSchema = z.object({
  analysisId: z.string().min(1, "Analisi obbligatoria"),
  analysisCodeSnapshot: z.string(),
  analysisNameSnapshot: z.string(),
  unitPriceCents: zCents,
  coveredByPackageId: z.string().optional(),
  chargeAnyway: z.boolean(),
  result: z.string().max(500).optional(),
});

export type SampleItem = z.infer<typeof SampleItemSchema>;

// ── Form step 1: dati base campione ───────────────────────────────────
export const SampleBaseFormSchema = z.object({
  clientId: z.string().min(1, "Seleziona un cliente"),
  sampleName: zNonEmptyString.max(200, "Nome campione troppo lungo"),
  receivedAt: z.string().min(1, "Data ricezione obbligatoria"), // "YYYY-MM-DD"
  notes: z.string().max(2000).optional(),
});

export type SampleBaseFormValues = z.infer<typeof SampleBaseFormSchema>;

// ── Form step 2: analisi richieste ────────────────────────────────────
export const SampleItemsFormSchema = z.object({
  items: z
    .array(SampleItemSchema)
    .min(1, "Aggiungi almeno un'analisi"),
});

export type SampleItemsFormValues = z.infer<typeof SampleItemsFormSchema>;

// ── Form step 3: pagamento ────────────────────────────────────────────
export const SamplePaymentFormSchema = z.object({
  createPayment: z.boolean(),
  installmentsCount: z.number().int().min(1).max(60).optional(),
  firstDueDate: z.string().optional(), // "YYYY-MM-DD"
  installmentPeriod: z.enum(["monthly", "biweekly", "custom"]).optional(),
});

export type SamplePaymentFormValues = z.infer<typeof SamplePaymentFormSchema>;

// ── Schema completo form campione (usato per invio finale) ────────────
export const SampleFormSchema = SampleBaseFormSchema.merge(SampleItemsFormSchema).merge(SamplePaymentFormSchema);

export type SampleFormValues = z.infer<typeof SampleFormSchema>;

// ── Documento Firestore campione ──────────────────────────────────────
export const SampleDocSchema = z.object({
  id: z.string(),
  code: z.string(),                   // "C-2026-0001"
  clientId: z.string(),
  clientNameSnapshot: z.string(),
  sampleName: z.string(),
  receivedAt: z.any(),            // Timestamp
  status: SampleStatusSchema,
  items: z.array(SampleItemSchema),
  estimatedTotalCents: zCents,
  paymentId: z.string().optional(),
  sourceQuoteId: z.string().optional(),
  notes: z.string().optional(),
  cancelledAt: z.any().optional(),
  cancelReason: z.string().optional(),
  version: z.number().int().min(0),
  createdAt: z.any(),
  updatedAt: z.any(),
});

export type SampleDoc = z.infer<typeof SampleDocSchema>;
