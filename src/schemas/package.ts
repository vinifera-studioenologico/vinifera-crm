import { z } from "zod";
import { zNonEmptyString, zCents, zEurInput } from "./validators";

// ── Form schema Pacchetto (template) ─────────────────────────────────
export const PackageFormSchema = z.object({
  name: zNonEmptyString.max(200, "Nome troppo lungo"),
  description: z.string().max(1000).optional(),
  totalAnalyses: z
    .number({ error: "Inserire un numero" })
    .int("Deve essere un numero intero")
    .min(1, "Il pacchetto deve includere almeno 1 analisi")
    .max(10000),
  priceCents: zEurInput,
  active: z.boolean(),
});

export type PackageFormValues = z.infer<typeof PackageFormSchema>;

// Documento Firestore (priceCents già in centesimi)
export const PackageDocSchema = PackageFormSchema.omit({ priceCents: true }).extend({
  id: z.string(),
  priceCents: zCents,
  version: z.number().int().min(0),
  createdAt: z.any(),
  updatedAt: z.any(),
  deletedAt: z.any().nullable(),
});

export type PackageDoc = z.infer<typeof PackageDocSchema>;

// ── Schema istanza cliente-pacchetto (clientPackages) ─────────────────
export const ClientPackageStatusSchema = z.enum(["active", "exhausted", "cancelled"]);
export type ClientPackageStatus = z.infer<typeof ClientPackageStatusSchema>;

export const ClientPackageFormSchema = z.object({
  clientId: z.string().min(1),
  packageId: z.string().min(1, "Scegli un pacchetto"),
  packageNameSnapshot: z.string(),
  totalAnalyses: z.number().int().min(1),
  priceCents: zEurInput,            // prezzo modificabile in fase di acquisto
  createPayment: z.boolean(),
  installmentsCount: z
    .number()
    .int()
    .min(1, "Almeno 1 rata")
    .max(60)
    .optional(),
  firstDueDate: z.string().optional(), // "YYYY-MM-DD" (input HTML date)
  installmentPeriod: z
    .enum(["monthly", "biweekly", "custom"])
    .optional(),
});

export type ClientPackageFormValues = z.infer<typeof ClientPackageFormSchema>;

export const ClientPackageDocSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  packageId: z.string(),
  packageNameSnapshot: z.string(),
  totalAnalyses: z.number().int().min(0),
  remainingAnalyses: z.number().int().min(0),
  priceCents: zCents,
  status: ClientPackageStatusSchema,
  paymentId: z.string().optional(),
  purchasedAt: z.any(),
  cancelledAt: z.any().optional(),
  cancelReason: z.string().optional(),
  createdAt: z.any(),
  updatedAt: z.any(),
});

export type ClientPackageDoc = z.infer<typeof ClientPackageDocSchema>;
