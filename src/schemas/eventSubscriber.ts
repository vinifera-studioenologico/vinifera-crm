/**
 * Schemi per gli iscritti alla mailing list "Tienimi aggiornato".
 * IncomingSubscribeSchema NON è nel barrel (schema di intake pubblico).
 * SubscriberDocSchema è esportato direttamente da questo file
 * (non nel barrel — usato solo nel CRM admin e nelle azioni server).
 */
import { z } from "zod";

// ── Enum stato iscritto ───────────────────────────────────────────────
export const SubscriberStatusEnum = z.enum([
  "pending",
  "active",
  "unsubscribed",
]);
export type SubscriberStatus = z.infer<typeof SubscriberStatusEnum>;

// ── Schema wire per iscrizione pubblica (snake_case) ─────────────────
export const IncomingSubscribeSchema = z.object({
  email: z.string().email("Email non valida"),
  locale: z.enum(["it", "en"]),
  // consenso esplicito obbligatorio
  consent: z.literal(true, "Il consenso al trattamento è obbligatorio"),
  // honeypot
  website: z.string().default(""),
});

export type IncomingSubscribeValues = z.infer<typeof IncomingSubscribeSchema>;

// ── Doc schema iscritto (documento Firestore) ─────────────────────────
export const SubscriberDocSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailNormalized: z.string(),
  status: SubscriberStatusEnum,
  locale: z.enum(["it", "en"]),
  confirmToken: z.string(),
  unsubscribeToken: z.string(),
  consentAt: z.any(), // Timestamp
  confirmedAt: z.any().nullable(),
  unsubscribedAt: z.any().nullable(),
  createdAt: z.any(),
  updatedAt: z.any(),
});

export type SubscriberDoc = z.infer<typeof SubscriberDocSchema>;
