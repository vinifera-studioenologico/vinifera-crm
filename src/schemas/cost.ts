import { z } from "zod";
import { zNonEmptyString, zCents, zEurInput } from "./validators";

// ── Categoria spesa ───────────────────────────────────────────────────
export const ExpenseCategorySchema = z.enum([
  "supplier_invoice", // bolla fornitore (con PDF)
  "utility",          // bollette (luce, acqua, gas, internet)
  "maintenance",      // manutenzione
  "consumable",       // materiale di consumo
  "kit_purchase",     // acquisto kit (collegato a costKits, ESCLUSO dalla media overhead)
  "fixed_cost",       // generata automaticamente da un costo fisso alla scadenza
  "other",            // altro
]);
export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;

// ── Form schema spesa ─────────────────────────────────────────────────
const ExpenseFormBaseSchema = z.object({
  description: zNonEmptyString.max(300, "Descrizione troppo lunga"),
  category: ExpenseCategorySchema,
  supplier: z.string().max(200).optional(),
  invoiceNumber: z.string().max(50).optional(),
  date: z.string().min(1, "Data obbligatoria"),   // "YYYY-MM-DD"
  periodFrom: z.string().optional(),               // "YYYY-MM-DD" inizio periodo (bollette)
  periodTo: z.string().optional(),                  // "YYYY-MM-DD" fine periodo (bollette)
  totalCents: zEurInput,
  notes: z.string().max(1000).optional(),
  items: z
    .array(
      z.object({
        articleCode: z.string().max(50).nullish(),
        description: z.string().max(300),
        quantity: z.number().min(0),
        unitPriceCents: z.number().int().min(0),  // già in centesimi
        totalCents: z.number().int().min(0),
      }),
    )
    .optional(),
});

export const ExpenseFormSchema = ExpenseFormBaseSchema.refine(
  (d) => {
    const hasFrom = !!d.periodFrom;
    const hasTo = !!d.periodTo;
    return hasFrom === hasTo; // entrambi o nessuno
  },
  { message: "Specificare sia inizio che fine periodo, oppure nessuno dei due", path: ["periodTo"] },
);
export type ExpenseFormValues = z.infer<typeof ExpenseFormSchema>;

// ── Doc Firestore spesa ───────────────────────────────────────────────
export const ExpenseDocSchema = ExpenseFormBaseSchema.omit({ totalCents: true }).extend({
  id: z.string(),
  totalCents: zCents,
  pdfStoragePath: z.string().nullable().optional(),
  pdfUrl: z.string().url().nullable().optional(),
  aiParsed: z.boolean().default(false),
  aiConfidence: z.number().min(0).max(1).optional(),
  fileHash: z.string().optional(),
  // ── Tracciabilità expense ↔ kit ──
  linkedKitIds: z.array(z.string()).optional(),
  kitOfferRef: z.string().nullable().optional(),
  // ── Tracciabilità expense ↔ costo fisso (generazione automatica a scadenza) ──
  fixedCostRef: z.string().nullable().optional(),
  version: z.number().int().min(0),
  createdAt: z.any(),
  updatedAt: z.any(),
  deletedAt: z.any().nullable(),
});
export type ExpenseDoc = z.infer<typeof ExpenseDocSchema>;

// ── Frequenza costo fisso ─────────────────────────────────────────────
export const FixedCostFrequencySchema = z.enum(["monthly", "quarterly", "annual"]);
export type FixedCostFrequency = z.infer<typeof FixedCostFrequencySchema>;

// ── Form schema costo fisso ───────────────────────────────────────────
const FixedCostFormBaseSchema = z.object({
  name: zNonEmptyString.max(200, "Nome troppo lungo"),
  description: z.string().max(500).optional(),
  amountCents: zEurInput,
  frequency: FixedCostFrequencySchema,
  // Giorno del mese in cui avviene il pagamento (1-31)
  paymentDay: z.number().int().min(1, "Giorno non valido").max(31, "Giorno non valido"),
  // Mese di riferimento (1-12): primo mese del ciclo per trimestrale/annuale.
  // Ignorato per i costi mensili.
  paymentMonth: z.number().int().min(1).max(12).optional(),
  active: z.boolean(),
  notifyTelegram: z.boolean().default(true),
  notifyEmail: z.boolean().default(false),
  reminderDaysBefore: z.number().int().min(0).max(30).default(3),
});

export const FixedCostFormSchema = FixedCostFormBaseSchema.refine(
  (d) => d.frequency === "monthly" || d.paymentMonth != null,
  { message: "Specificare il mese di pagamento", path: ["paymentMonth"] },
);
export type FixedCostFormValues = z.infer<typeof FixedCostFormSchema>;

// ── Doc Firestore costo fisso ─────────────────────────────────────────
export const FixedCostDocSchema = FixedCostFormBaseSchema.omit({ amountCents: true }).extend({
  id: z.string(),
  amountCents: zCents,
  version: z.number().int().min(0),
  createdAt: z.any(),
  updatedAt: z.any(),
  deletedAt: z.any().nullable(),
});
export type FixedCostDoc = z.infer<typeof FixedCostDocSchema>;

// ── Form schema Kit ───────────────────────────────────────────────────
export const KitFormSchema = z.object({
  supplierArticleCode: zNonEmptyString.max(50, "Codice troppo lungo"),
  supplierName: z.string().max(200).optional(),
  name: zNonEmptyString.max(200, "Nome troppo lungo"),
  analysisId: z.string().min(1, "Seleziona un'analisi").optional(),
  analysisCodeSnapshot: z.string().nullable(),
  analysisNameSnapshot: z.string().nullable(),
  numberOfTests: z
    .number()
    .int()
    .min(1, "Almeno 1 determinazione")
    .max(100000),
  lastPurchasePriceCents: zEurInput,
});
export type KitFormValues = z.infer<typeof KitFormSchema>;

// ── Doc Firestore Kit ─────────────────────────────────────────────────
export const KitDocSchema = KitFormSchema.omit({ lastPurchasePriceCents: true }).extend({
  id: z.string(),
  lastPurchasePriceCents: zCents,
  costPerTestCents: zCents,
  version: z.number().int().min(0),
  createdAt: z.any(),
  updatedAt: z.any(),
  deletedAt: z.any().nullable(),
});
export type KitDoc = z.infer<typeof KitDocSchema>;

// ── Schema payload import offerta kit ───────────────────────────────

// Riga di import kit (post-recap, pronta alla scrittura)
export const KitImportLineSchema = z
  .object({
    action: z.enum(["create", "update"]),
    kitId: z.string().optional(),
    expectedVersion: z.number().int().min(0).optional(),
    supplierArticleCode: zNonEmptyString.max(50),
    supplierName: z.string().max(200).optional(),
    name: zNonEmptyString.max(200),
    analysisId: z.string().optional(),
    numberOfTests: z.number().int().min(1).max(100000),
    lastPurchasePriceCents: zCents,
  })
  .refine(
    (l) => l.action === "create" || (l.kitId != null && l.expectedVersion != null),
    { message: "kitId ed expectedVersion obbligatori per update", path: ["kitId"] },
  );

// Dati spesa associata all'offerta
export const KitOfferExpenseSchema = z.object({
  description: zNonEmptyString.max(300),
  date: zNonEmptyString,
  totalCents: zCents,
  supplier: z.string().max(200).optional(),
  invoiceNumber: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
});

// Payload completo import
export const KitOfferImportSchema = z.object({
  lines: z.array(KitImportLineSchema).min(1, "Almeno una riga da importare"),
  expense: KitOfferExpenseSchema.nullable(),
});
export type KitImportLineValues = z.infer<typeof KitImportLineSchema>;
export type KitOfferExpenseValues = z.infer<typeof KitOfferExpenseSchema>;
export type KitOfferImportValues = z.infer<typeof KitOfferImportSchema>;

// ── Settings modulo costi ─────────────────────────────────────────────
export const CostsSettingsSchema = z.object({
  defaultMarginPercent: z.number().min(0).default(5),
  estimatedMonthlyAnalyses: z.number().int().min(1).default(100),
  costAllocationPercent: z.number().min(0).max(100).default(100),
  productConfigPdfPath: z.string().nullable().optional(),
  productConfigPdfUrl: z.string().url().nullable().optional(),
});
export type CostsSettingsValues = z.infer<typeof CostsSettingsSchema>;
