import { z } from "zod";
import { zCodiceFiscale, zPartitaIva, zEmail, zBillingAddress } from "./validators";

// ── Enum stati ordine ─────────────────────────────────────────────────
export const OrderStatusEnum = z.enum([
  "pending_payment",
  "paid",
  "expired",
  "refunded",
  "failed",
  "cancelled",
]);
export type OrderStatus = z.infer<typeof OrderStatusEnum>;

// ── Profilo di fatturazione (union discriminata) ──────────────────────
const BillingAddressSchema = zBillingAddress;

const BillingPrivateSchema = z.object({
  type: z.literal("private"),
  firstName: z.string().min(1, "Nome obbligatorio"),
  lastName: z.string().min(1, "Cognome obbligatorio"),
  taxCode: zCodiceFiscale,
  address: BillingAddressSchema,
});

const BillingCompanySchema = z
  .object({
    type: z.literal("company"),
    businessName: z.string().min(1, "Ragione sociale obbligatoria"),
    vatNumber: zPartitaIva,
    sdiCode: z
      .string()
      .refine(
        (v) => v === "" || /^[A-Z0-9]{7}$/i.test(v),
        "Codice SDI non valido (7 caratteri alfanumerici)",
      )
      .nullable()
      .default(null),
    pec: z.union([zEmail, z.literal("")]).nullable().default(null),
    taxCode: zCodiceFiscale.optional().nullable().default(null),
    adminContactName: z.string().nullable().default(null),
    address: BillingAddressSchema,
  })
  .refine(
    (v) =>
      (v.sdiCode !== null && v.sdiCode !== "") ||
      (v.pec !== null && v.pec !== ""),
    {
      message:
        "Inserire almeno il Codice SDI oppure la PEC per la fatturazione aziendale",
      path: ["sdiCode"],
    },
  );

export const BillingProfileSchema = z.discriminatedUnion("type", [
  BillingPrivateSchema,
  BillingCompanySchema,
]);
export type BillingProfile = z.infer<typeof BillingProfileSchema>;

// ── Snapshot evento incorporato nell'ordine ───────────────────────────
const EventSnapshotSchema = z.object({
  slug: z.string(),
  titleIt: z.string(),
  startsAt: z.any(), // Timestamp
  locationName: z.string(),
});

// ── Partecipante ──────────────────────────────────────────────────────
const ParticipantSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

// ── Doc schema ordine (documento Firestore) ───────────────────────────
export const EventOrderDocSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  eventId: z.string(),
  eventSnapshot: EventSnapshotSchema,
  seats: z.number().int().min(1),
  unitPriceCents: z.number().int().min(0),
  totalCents: z.number().int().min(0),
  status: OrderStatusEnum,
  buyer: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    emailNormalized: z.string(),
    phone: z.string(),
    phoneNormalized: z.string(),
  }),
  participants: z.array(ParticipantSchema),
  billing: BillingProfileSchema.nullable(),
  historyConsent: z.object({
    granted: z.boolean(),
    at: z.any().nullable(), // Timestamp | null
  }),
  locale: z.enum(["it", "en"]),
  holdExpiresAt: z.any().nullable(),
  paymentIntentId: z.string().nullable(),
  paidAt: z.any().nullable(),
  refundedAt: z.any().nullable(),
  refundId: z.string().nullable(),
  ip: z.string().nullable(),
  version: z.number().int().min(0),
  createdAt: z.any(),
  updatedAt: z.any(),
  deletedAt: z.any().nullable(),
});

export type EventOrderDoc = z.infer<typeof EventOrderDocSchema>;

// ── Doc transazione (subcollection eventOrders/{id}/transactions/{id}) ─
export const OrderTransactionDocSchema = z.object({
  id: z.string(),
  stripeEventId: z.string().nullable(),
  type: z.string(),
  amountCents: z.number().int().nullable(),
  summary: z.string(),
  createdAt: z.any(),
});

export type OrderTransactionDoc = z.infer<typeof OrderTransactionDocSchema>;
