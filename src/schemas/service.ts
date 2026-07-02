import { z } from "zod";

// ── Bilingue helper ───────────────────────────────────────────────────
const zBilingualString = z.object({
  it: z.string().min(1, "Campo IT obbligatorio"),
  en: z.string(),
});

const zBilingualOptionalString = z.object({
  it: z.string(),
  en: z.string(),
});

const zFaqItem = z.object({
  q: z.string().min(1),
  a: z.string().min(1),
});

const zFaqItemOptional = z.object({
  q: z.string(),
  a: z.string(),
});

const zBilingualFaq = z.object({
  it: z.array(zFaqItem),
  en: z.array(zFaqItemOptional),
});

const zBilingualBenefits = z.object({
  it: z.array(z.string().min(1)),
  en: z.array(z.string()),
});

// ── Form schema (usato nell'UI del CRM per creare/editare servizi) ────
const ServiceFormObject = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug: solo lettere minuscole, numeri, trattini"),
  order: z.number().int().min(0),
  inEvidenza: z.boolean(),
  available: z.boolean(),

  title: zBilingualString,
  summary: zBilingualString,
  description: zBilingualString,
  benefits: zBilingualBenefits,
  faq: zBilingualFaq,

  imageUrl: z.union([z.literal(""), z.string().url("URL immagine non valido")]),
  images: z.array(z.string().url()).default([]),

  basePrice: z.number().min(0).nullable(),
  discountedPrice: z.number().min(0).nullable(),
  priceLabel: zBilingualOptionalString.nullable(),
});

export const ServiceFormSchema = ServiceFormObject
  .refine((v) => v.discountedPrice === null || v.basePrice !== null, {
    message: "Il prezzo scontato richiede un prezzo base",
    path: ["discountedPrice"],
  })
  .refine(
    (v) =>
      v.discountedPrice === null ||
      v.basePrice === null ||
      v.discountedPrice < v.basePrice,
    {
      message: "Il prezzo scontato deve essere inferiore al prezzo base",
      path: ["discountedPrice"],
    },
  );

export type ServiceFormValues = z.infer<typeof ServiceFormSchema>;

// ── Doc schema (dal Firestore) ────────────────────────────────────────
export const ServiceDocSchema = ServiceFormObject.extend({
  id: z.string(),
  version: z.number().int().min(0),
  createdAt: z.any(),
  updatedAt: z.any(),
  deletedAt: z.any().nullable(),
});

export type ServiceDoc = z.infer<typeof ServiceDocSchema>;
