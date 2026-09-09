import { z } from "zod";
import { ClientSnapshotSchema } from "./client";

// ── Documento Firestore referto riepilogativo ──────────────────────────
// Un "mega referto" che riassume più referti già emessi per lo stesso
// cliente (a loro volta contenenti i campioni), con il totale complessivo.
export const ReportSummaryDocSchema = z.object({
  id: z.string(),
  number: z.string(),          // "RS-0001"
  clientId: z.string(),
  clientSnapshot: ClientSnapshotSchema,
  reportIds: z.array(z.string()).min(2).max(50), // almeno 2 referti da riepilogare
  totalCents: z.number().int(),
  generatedAt: z.any(),    // Timestamp
  pdfStorageRef: z.string(),
  notes: z.string().optional(),
  createdAt: z.any(),
  updatedAt: z.any(),
});

export type ReportSummaryDoc = z.infer<typeof ReportSummaryDocSchema>;

// ── Form per nuovo referto riepilogativo ───────────────────────────────
export const ReportSummaryFormSchema = z.object({
  clientId: z.string().min(1, "Seleziona un cliente"),
  reportIds: z
    .array(z.string())
    .min(2, "Seleziona almeno due referti da riepilogare")
    .max(50, "Massimo 50 referti per riepilogo"),
  notes: z.string().max(2000).optional(),
});

export type ReportSummaryFormValues = z.infer<typeof ReportSummaryFormSchema>;
