import { describe, it, expect } from "vitest";
import { IncomingLeadSchema, LeadDocSchema, LeadSourceEnum, LeadStatusEnum } from "./lead";

describe("IncomingLeadSchema", () => {
  const validLead = {
    name: "Mario Rossi",
    phone: "+39 333 1234567",
    email: "mario@example.com",
    message: "Vorrei informazioni",
    service_id: "consulenza-enologica",
    service_title: "Consulenza Enologica",
    source: "form" as const,
    locale: "it" as const,
    page_url: "https://example.com/servizi/consulenza-enologica",
  };

  it("accetta un lead valido con tutti i campi", () => {
    const result = IncomingLeadSchema.safeParse(validLead);
    expect(result.success).toBe(true);
  });

  it("accetta lead senza campi opzionali", () => {
    const { email, message, page_url, ...minimal } = validLead;
    const result = IncomingLeadSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("accetta email vuota (stringa vuota)", () => {
    const result = IncomingLeadSchema.safeParse({ ...validLead, email: "" });
    expect(result.success).toBe(true);
  });

  it("accetta source whatsapp", () => {
    const result = IncomingLeadSchema.safeParse({ ...validLead, source: "whatsapp" });
    expect(result.success).toBe(true);
  });

  it("accetta locale en", () => {
    const result = IncomingLeadSchema.safeParse({ ...validLead, locale: "en" });
    expect(result.success).toBe(true);
  });

  it("accetta UTM params", () => {
    const result = IncomingLeadSchema.safeParse({
      ...validLead,
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "estate2024",
    });
    expect(result.success).toBe(true);
  });

  it("rifiuta nome troppo corto", () => {
    const result = IncomingLeadSchema.safeParse({ ...validLead, name: "A" });
    expect(result.success).toBe(false);
  });

  it("rifiuta nome troppo lungo", () => {
    const result = IncomingLeadSchema.safeParse({ ...validLead, name: "A".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("rifiuta telefono non valido", () => {
    const result = IncomingLeadSchema.safeParse({ ...validLead, phone: "abc" });
    expect(result.success).toBe(false);
  });

  it("rifiuta email non valida", () => {
    const result = IncomingLeadSchema.safeParse({ ...validLead, email: "not-email" });
    expect(result.success).toBe(false);
  });

  it("rifiuta source non valido", () => {
    const result = IncomingLeadSchema.safeParse({ ...validLead, source: "telegram" });
    expect(result.success).toBe(false);
  });

  it("rifiuta locale non valido", () => {
    const result = IncomingLeadSchema.safeParse({ ...validLead, locale: "fr" });
    expect(result.success).toBe(false);
  });

  it("rifiuta service_id vuoto", () => {
    const result = IncomingLeadSchema.safeParse({ ...validLead, service_id: "" });
    expect(result.success).toBe(false);
  });

  it("rifiuta messaggio troppo lungo", () => {
    const result = IncomingLeadSchema.safeParse({ ...validLead, message: "A".repeat(301) });
    expect(result.success).toBe(false);
  });

  it("rifiuta page_url non valida", () => {
    const result = IncomingLeadSchema.safeParse({ ...validLead, page_url: "not-a-url" });
    expect(result.success).toBe(false);
  });
});

describe("LeadSourceEnum", () => {
  it("accetta website_form", () => {
    expect(LeadSourceEnum.safeParse("website_form").success).toBe(true);
  });
  it("accetta website_whatsapp", () => {
    expect(LeadSourceEnum.safeParse("website_whatsapp").success).toBe(true);
  });
  it("accetta manual", () => {
    expect(LeadSourceEnum.safeParse("manual").success).toBe(true);
  });
  it("rifiuta valore sconosciuto", () => {
    expect(LeadSourceEnum.safeParse("telegram").success).toBe(false);
  });
});

describe("LeadStatusEnum", () => {
  it.each(["new", "contacted", "converted", "archived"] as const)("accetta %s", (status) => {
    expect(LeadStatusEnum.safeParse(status).success).toBe(true);
  });
  it("rifiuta valore sconosciuto", () => {
    expect(LeadStatusEnum.safeParse("deleted").success).toBe(false);
  });
});

describe("LeadDocSchema", () => {
  it("accetta doc completo", () => {
    const result = LeadDocSchema.safeParse({
      id: "lead-123",
      name: "Mario Rossi",
      phone: "+39 333 1234567",
      email: "mario@test.com",
      message: "Info",
      serviceId: "consulenza-enologica",
      serviceTitle: "Consulenza Enologica",
      source: "website_form",
      status: "new",
      locale: "it",
      pageUrl: "https://example.com",
      notes: "Chiamato, interessato",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accetta doc senza campi opzionali", () => {
    const result = LeadDocSchema.safeParse({
      id: "lead-123",
      name: "Mario Rossi",
      phone: "+39 333 1234567",
      serviceId: "test",
      serviceTitle: "Test",
      source: "website_whatsapp",
      status: "contacted",
      locale: "en",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});
