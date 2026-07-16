import { z } from "zod";
import { RecurrenceSchema } from "./reminder";

// ── Enum stati interni dell'evento ────────────────────────────────────
export const EventStatusEnum = z.enum(["draft", "published", "cancelled"]);
export type EventStatus = z.infer<typeof EventStatusEnum>;

// ── Helper bilingue (locale) ──────────────────────────────────────────
const zBilingualRequired = z.object({
  it: z.string().min(1, "Campo IT obbligatorio"),
  en: z.string(),
});

const zBilingualOptional = z.object({
  it: z.string(),
  en: z.string(),
});

// ── Form schema (UI admin CRM) ────────────────────────────────────────
const EventFormObject = z.object({
  slug: z
    .string()
    .min(1, "Slug obbligatorio")
    .max(120)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug: solo lettere minuscole, numeri, trattini",
    ),
  title: zBilingualRequired,
  summary: zBilingualRequired,
  description: zBilingualOptional,

  imageUrl: z.union([z.literal(""), z.string().url("URL immagine non valido")]),
  images: z.array(z.string().url()).default([]),

  location: z.object({
    name: z.string().min(1, "Nome luogo obbligatorio"),
    address: z.string(),
    city: z.string().min(1, "Città obbligatoria"),
  }),

  // Datetime come stringa ISO "YYYY-MM-DDTHH:mm" (input datetime-local)
  startsAt: z.string().min(1, "Data inizio obbligatoria"),
  endsAt: z.string().nullable().default(null),
  bookingOpensAt: z.string().nullable().default(null),
  bookingClosesAt: z.string().nullable().default(null),

  capacity: z.number().int("Capacità intera").min(1, "Capacità minima 1"),

  // null = nessun limite (default); obbligatorio se gratuito (refine sotto)
  maxSeatsPerOrder: z.number().int().min(1).nullable().default(null),

  // Centesimi interi: 0 = evento gratuito, oppure >= 50 (minimo Stripe)
  priceCents: z.number().int("Prezzo in centesimi interi").min(0),

  // Prezzo scontato: null o int >= 50; solo se priceCents > 0 (refine sotto)
  discountedPriceCents: z.number().int().min(50).nullable().default(null),

  featured: z.boolean().default(false),

  recurrence: RecurrenceSchema.nullable().default(null),
});

export const EventFormSchema = EventFormObject.superRefine((v, ctx) => {
  // priceCents deve essere 0 (gratuito) oppure >= 50 (minimo Stripe)
  if (v.priceCents !== 0 && v.priceCents < 50) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Il prezzo deve essere 0 (gratuito) oppure almeno 0,50 € (50 centesimi)",
      path: ["priceCents"],
    });
  }

  // discountedPriceCents: vietato se gratuito
  if (v.priceCents === 0 && v.discountedPriceCents !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Un evento gratuito non può avere un prezzo scontato",
      path: ["discountedPriceCents"],
    });
  }

  // discountedPriceCents: se valorizzato, deve essere < priceCents
  if (
    v.discountedPriceCents !== null &&
    v.priceCents > 0 &&
    v.discountedPriceCents >= v.priceCents
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Il prezzo scontato deve essere inferiore al prezzo base",
      path: ["discountedPriceCents"],
    });
  }

  // maxSeatsPerOrder obbligatorio per gli eventi gratuiti
  if (v.priceCents === 0 && (v.maxSeatsPerOrder === null || v.maxSeatsPerOrder === undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Imposta un numero massimo di posti per ordine per gli eventi gratuiti",
      path: ["maxSeatsPerOrder"],
    });
  }
});

export type EventFormValues = z.infer<typeof EventFormSchema>;

// ── Doc schema (documento Firestore) ─────────────────────────────────
export const EventDocSchema = EventFormObject.extend({
  id: z.string(),
  status: EventStatusEnum,
  seatsSold: z.number().int().min(0),
  seatsHeld: z.number().int().min(0),
  subscribersNotifiedAt: z.any().nullable(),
  cancelledAt: z.any().nullable(),
  recurrenceParentId: z.string().nullable(),
  recurrenceProcessedAt: z.any().nullable(),
  // Override date fields → Firestore Timestamp (z.any())
  startsAt: z.any(),
  endsAt: z.any().nullable(),
  bookingOpensAt: z.any().nullable(),
  bookingClosesAt: z.any().nullable(),
  createdBy: z.string(),
  version: z.number().int().min(0),
  createdAt: z.any(),
  updatedAt: z.any(),
  deletedAt: z.any().nullable(),
});

export type EventDoc = z.infer<typeof EventDocSchema>;
