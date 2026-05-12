import { z } from "zod";
import { zNonEmptyString } from "./validators";

// ── Status promemoria ─────────────────────────────────────────────────
export const ReminderStatusSchema = z.enum([
  "pending",
  "done",
  "snoozed",
  "cancelled",
]);
export type ReminderStatus = z.infer<typeof ReminderStatusSchema>;

// ── Entità collegata (opzionale) ──────────────────────────────────────
export const ReminderRelatedSchema = z.object({
  kind: z.enum(["client", "sample", "quote", "payment"]),
  id: z.string(),
});
export type ReminderRelated = z.infer<typeof ReminderRelatedSchema>;

// ── Regola ricorrenza (§16.12) ────────────────────────────────────────
export const RecurrenceSchema = z.object({
  rule: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).max(365),
  until: z.any().optional(), // Timestamp
});
export type Recurrence = z.infer<typeof RecurrenceSchema>;

// ── Form promemoria ───────────────────────────────────────────────────
export const ReminderFormSchema = z.object({
  title: zNonEmptyString.max(200, "Titolo troppo lungo"),
  description: z.string().max(2000).optional(),
  dueAt: z.string().min(1, "Data scadenza obbligatoria"), // "YYYY-MM-DDTHH:mm" (datetime-local input)
  relatedTo: ReminderRelatedSchema.optional(),
  remindBeforeMinutes: z
    .number()
    .int()
    .min(0)
    .max(43200) // max 30 giorni in minuti
    .optional(),
  notifyChannels: z.object({
    telegram: z.boolean(),
    email: z.boolean(),
  }),
  recurrence: RecurrenceSchema.optional(),
});

export type ReminderFormValues = z.infer<typeof ReminderFormSchema>;

// ── Documento Firestore promemoria ────────────────────────────────────
export const ReminderDocSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  dueAt: z.any(),           // Timestamp
  relatedTo: ReminderRelatedSchema.optional(),
  status: ReminderStatusSchema,
  remindBeforeMinutes: z.number().int().optional(),
  notifyChannels: z.object({
    telegram: z.boolean(),
    email: z.boolean(),
  }),
  notifiedAt: z.any().optional(),
  doneAt: z.any().optional(),
  recurrence: RecurrenceSchema.optional(),
  createdAt: z.any(),
  updatedAt: z.any(),
});

export type ReminderDoc = z.infer<typeof ReminderDocSchema>;
