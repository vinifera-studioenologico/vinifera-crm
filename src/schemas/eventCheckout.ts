/**
 * Schema wire per il checkout pubblico degli eventi.
 * Formato snake_case (body JSON dal sito → CRM).
 * NON ri-esportato dal barrel (schema di intake pubblico, come lead.ts).
 */
import { z } from "zod";

// ── Sub-schemi wire ───────────────────────────────────────────────────

const WireBuyerSchema = z.object({
  first_name: z.string().min(1, "Nome obbligatorio"),
  last_name: z.string().min(1, "Cognome obbligatorio"),
  email: z.string().email("Email non valida"),
  phone: z
    .string()
    .min(6, "Numero di telefono non valido")
    .max(20, "Numero di telefono non valido"),
});

const WireParticipantSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
});

// Indirizzo di fatturazione wire
const WireAddressSchema = z.object({
  street: z.string().min(1),
  zip: z.string().regex(/^\d{5}$/, "CAP non valido"),
  city: z.string().min(1),
  province: z.string().min(1).max(2),
});

const WireBillingPrivateSchema = z.object({
  type: z.literal("private"),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  tax_code: z
    .string()
    .min(1)
    .regex(/^[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]$/i, "Codice fiscale non valido"),
  address: WireAddressSchema,
});

const WireBillingCompanySchema = z.object({
  type: z.literal("company"),
  business_name: z.string().min(1),
  vat_number: z.string().regex(/^\d{11}$/, "P.IVA non valida"),
  sdi_code: z.string().nullable().optional(),
  pec: z.string().email().nullable().optional(),
  tax_code: z.string().nullable().optional(),
  admin_contact_name: z.string().nullable().optional(),
  address: WireAddressSchema,
});

const WireBillingSchema = z.discriminatedUnion("type", [
  WireBillingPrivateSchema,
  WireBillingCompanySchema,
]);

// ── Schema principale checkout ────────────────────────────────────────
export const IncomingCheckoutSchema = z.object({
  event_id: z.string().min(1),
  seats: z.number().int().min(1),
  locale: z.enum(["it", "en"]),
  buyer: WireBuyerSchema,
  // participants.length deve corrispondere a seats — enforcement nell'endpoint
  // (non qui: Zod non conosce il valore di `seats` a questo livello)
  participants: z.array(WireParticipantSchema).min(1),
  // billing è opzionale nel wire schema: obbligatorio se pagamento, vietato se gratuito
  // (enforcement nell'endpoint, che conosce il tipo evento)
  billing: WireBillingSchema.optional(),
  history_consent: z.boolean(),
  // honeypot: se valorizzato → risposta fake 200 senza processare
  website: z.string().default(""),
});

export type IncomingCheckoutValues = z.infer<typeof IncomingCheckoutSchema>;
