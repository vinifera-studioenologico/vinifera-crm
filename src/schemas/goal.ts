import { z } from "zod";
import { zEurInput } from "./validators";

// ── Obiettivi annuali ────────────────────────────────────────────────
// Un documento per anno (id == String(year)): impossibile per costruzione
// avere due set di obiettivi per lo stesso anno, lettura diretta senza query.
//
// Metriche v1, decise dal cliente in sessione (non le tre proposte nel
// documento di sviluppo, che includevano anche "numero campioni"):
// fatturato incassato e nuovi clienti, questi ultimi separati per
// aziende/privati anziché un unico totale.

const GoalFormBaseSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  revenueTargetCents: zEurInput.optional(),
  newBusinessClientsTarget: z.number().int().min(0).optional(),
  newPrivateClientsTarget: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional(),
});

export const GoalFormSchema = GoalFormBaseSchema.refine(
  (d) =>
    d.revenueTargetCents != null ||
    d.newBusinessClientsTarget != null ||
    d.newPrivateClientsTarget != null,
  {
    message: "Imposta almeno un obiettivo",
    path: ["revenueTargetCents"],
  },
);
export type GoalFormValues = z.infer<typeof GoalFormSchema>;

export const GoalDocSchema = GoalFormBaseSchema.extend({
  id: z.string(), // == String(year)
  version: z.number().int().min(0),
  createdAt: z.any(), // Timestamp
  updatedAt: z.any(), // Timestamp
  deletedAt: z.any().nullable(), // Timestamp
});
export type GoalDoc = z.infer<typeof GoalDocSchema>;
