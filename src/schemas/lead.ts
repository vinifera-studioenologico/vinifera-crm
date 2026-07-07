import { z } from "zod";

export const LeadSourceEnum = z.enum(["website_form", "website_whatsapp", "manual"]);
export type LeadSource = z.infer<typeof LeadSourceEnum>;

export const LeadStatusEnum = z.enum(["new", "contacted", "converted", "archived"]);
export type LeadStatus = z.infer<typeof LeadStatusEnum>;

// ── Schema per la ricezione da API pubblica ───────────────────────────
export const IncomingLeadSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(6).max(20).regex(/^[+\d\s\-().]{6,20}$/),
  email: z.string().email().optional().or(z.literal("")),
  message: z.string().max(300).optional(),
  service_id: z.string().min(1).max(100),
  service_title: z.string().min(1).max(200),
  source: z.enum(["form", "whatsapp"]),
  locale: z.enum(["it", "en"]),
  page_url: z.string().url().optional(),
  utm_source: z.string().max(100).optional(),
  utm_medium: z.string().max(100).optional(),
  utm_campaign: z.string().max(100).optional(),
  posthog_distinct_id: z.string().max(200).optional(),
  posthog_session_id: z.string().max(200).optional(),
});

export type IncomingLeadValues = z.infer<typeof IncomingLeadSchema>;

// ── Doc schema (salvato in Firestore) ─────────────────────────────────
export const LeadDocSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  email: z.string().optional(),
  message: z.string().optional(),
  serviceId: z.string(),
  serviceTitle: z.string(),
  source: LeadSourceEnum,
  status: LeadStatusEnum,
  locale: z.enum(["it", "en"]),
  pageUrl: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  posthogDistinctId: z.string().optional(),
  posthogSessionId: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.any(),
  updatedAt: z.any(),
});

export type LeadDoc = z.infer<typeof LeadDocSchema>;
