import { z } from "zod";
import { ClientSnapshotSchema } from "./client";

// ── Documento Firestore referto ───────────────────────────────────────
export const ReportDocSchema = z.object({
  id: z.string(),
  number: z.string(),          // "R-2026-0001"
  clientId: z.string(),
  clientSnapshot: ClientSnapshotSchema,
  sampleIds: z.array(z.string()).min(1).max(100), // max 100 campioni per referto §18.15
  generatedAt: z.any(),    // Timestamp
  pdfStorageRef: z.string(),
  notes: z.string().optional(),
  createdAt: z.any(),
  updatedAt: z.any(),
});

export type ReportDoc = z.infer<typeof ReportDocSchema>;

// ── Form per nuovo referto ────────────────────────────────────────────
export const ReportFormSchema = z.object({
  clientId: z.string().min(1, "Seleziona un cliente"),
  sampleIds: z
    .array(z.string())
    .min(1, "Seleziona almeno un campione")
    .max(100, "Massimo 100 campioni per referto"),
  notes: z.string().max(2000).optional(),
});

export type ReportFormValues = z.infer<typeof ReportFormSchema>;
