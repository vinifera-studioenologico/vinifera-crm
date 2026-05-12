import { z } from "zod";
import { zNonEmptyString, zCents, zEurInput } from "./validators";

// ── Form schema Analisi ───────────────────────────────────────────────
export const AnalysisFormSchema = z.object({
  code: zNonEmptyString
    .max(20, "Codice troppo lungo")
    .regex(/^[A-Z0-9\-]+$/i, "Codice: solo lettere, numeri e trattini"),
  name: zNonEmptyString.max(200, "Nome troppo lungo"),
  category: z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
  defaultPriceCents: zEurInput,
  unit: z.string().max(30).optional(),
  active: z.boolean(),
});

export type AnalysisFormValues = z.infer<typeof AnalysisFormSchema>;

// Versione con importo già in centesimi (usata lato server / read da Firestore)
export const AnalysisDocSchema = AnalysisFormSchema.omit({
  defaultPriceCents: true,
}).extend({
  id: z.string(),
  defaultPriceCents: zCents,
  version: z.number().int().min(0),
  createdAt: z.any(),
  updatedAt: z.any(),
  deletedAt: z.any().nullable(),
});

export type AnalysisDoc = z.infer<typeof AnalysisDocSchema>;

// Snapshot analisi (usato nelle righe campione/preventivo)
export const AnalysisSnapshotSchema = z.object({
  analysisId: z.string(),
  codeSnapshot: z.string(),
  nameSnapshot: z.string(),
  defaultPriceCents: zCents,
  unit: z.string().optional(),
});

export type AnalysisSnapshot = z.infer<typeof AnalysisSnapshotSchema>;
