import { z } from "zod";
import {
  zNonEmptyString,
  zEmail,
  zPhone,
  zVatNumber,
  zTaxCode,
  zIBAN,
  zSdiCode,
  zAddress,
} from "./validators";

// ── Address ───────────────────────────────────────────────────────────
export { zAddress };

// ── Stats denormalizzate (read-only dal server, non editabili da form) ─
const zClientStats = z.object({
  activePackagesCount: z.number().int().min(0),
  remainingAnalyses: z.number().int().min(0),
  totalRevenueCents: z.number().int().min(0),
  pendingAmountCents: z.number().int().min(0),
  overdueAmountCents: z.number().int().min(0),
  samplesPending: z.number().int().min(0),
});

// ── Form schema per "Nuovo / Modifica Cliente" ─────────────────────────
// Questo schema viene usato sia nei form (react-hook-form resolver)
// sia nelle Server Actions per la validazione server-side.

const zBaseClient = z.object({
  displayName: zNonEmptyString.max(200, "Ragione sociale troppo lunga"),
  email: zEmail,
  phone: zPhone,
  address: zAddress.optional(),
  billingAddress: zAddress.optional(),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

const zBusinessClient = zBaseClient.extend({
  type: z.literal("business"),
  vatNumber: zVatNumber,
  sdiCode: zSdiCode.optional(),
  pec: zEmail.optional().or(z.literal("")),
  taxCode: zTaxCode.optional().or(z.literal("")),
});

const zIndividualClient = zBaseClient.extend({
  type: z.literal("individual"),
  firstName: zNonEmptyString.max(100),
  lastName: zNonEmptyString.max(100),
  taxCode: zTaxCode.optional().or(z.literal("")),
  vatNumber: z.string().optional(),
});

export const ClientFormSchema = z.discriminatedUnion("type", [
  zBusinessClient,
  zIndividualClient,
]);

export type ClientFormValues = z.infer<typeof ClientFormSchema>;

// ── Documento Firestore completo (include campi server-only) ───────────
export const ClientDocSchema = ClientFormSchema.and(
  z.object({
    id: z.string(),
    stats: zClientStats,
    version: z.number().int().min(0),
    createdAt: z.any(), // Timestamp Firestore — non validato con Zod
    updatedAt: z.any(),
    deletedAt: z.any().nullable(),
  }),
);

export type ClientDoc = z.infer<typeof ClientDocSchema>;

// ── Snapshot cliente (usato in quote, samples, reports) ───────────────
export const ClientSnapshotSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string(),
  phone: z.string().optional(),
  vatNumber: z.string().optional(),
  taxCode: z.string().optional(),
  address: zAddress.optional(),
  type: z.enum(["business", "individual"]),
});

export type ClientSnapshot = z.infer<typeof ClientSnapshotSchema>;

// ── Settings azienda (singleton settings/company) ─────────────────────
export const CompanySettingsSchema = z.object({
  legalName: zNonEmptyString.max(200),
  displayName: zNonEmptyString.max(100),
  vatNumber: zVatNumber,
  taxCode: zTaxCode.optional().or(z.literal("")),
  address: zAddress,
  email: zEmail,
  phone: zPhone,
  pec: zEmail.optional().or(z.literal("")),
  iban: zIBAN.optional().or(z.literal("")),
  bankName: z.string().max(200).optional(),
  logoUrl: z.string().url().optional().or(z.literal("")),
  defaultEnpaiaPercent: z.number().min(0).max(100),
  defaultVatPercent: z.number().min(0).max(100),
  defaultEnpaiaApplied: z.boolean(),
  quoteFooterNote: z.string().max(1000).optional(),
  reportFooterNote: z.string().max(1000).optional(),
  reportLegalNote: z.string().max(2000).optional(),
  // Testi personalizzati PDF preventivo
  quoteFiscalNote: z.string().max(3000).optional(),
  quoteConditions: z.string().max(5000).optional(),
  quotePrivacyNote: z.string().max(2000).optional(),
  quoteAcceptanceText: z.string().max(2000).optional(),
  // Filigrana PDF
  watermarkEnabled: z.boolean().optional(),
  watermarkUrl: z.string().url().optional().or(z.literal("")),
  watermarkRotation: z.number().int().min(-180).max(180).optional(),
  // Dimensione font PDF preventivo
  quoteFontSize: z.enum(["sm", "md", "lg", "xl"]).optional(),
});

export type CompanySettingsValues = z.infer<typeof CompanySettingsSchema>;
