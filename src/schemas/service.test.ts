import { describe, it, expect } from "vitest";
import { ServiceFormSchema, ServiceDocSchema } from "./service";

describe("ServiceFormSchema", () => {
  const validService = {
    slug: "consulenza-enologica",
    order: 1,
    inEvidenza: true,
    available: true,
    title: { it: "Consulenza Enologica", en: "Winemaking Consultancy" },
    summary: { it: "Descrizione breve IT", en: "Short description EN" },
    description: { it: "Descrizione lunga IT", en: "Long description EN" },
    benefits: { it: ["Beneficio 1"], en: ["Benefit 1"] },
    faq: { it: [{ q: "Domanda?", a: "Risposta." }], en: [{ q: "Question?", a: "Answer." }] },
    imageUrl: "https://example.com/image.jpg",
    images: [],
    basePrice: 450,
    discountedPrice: null,
    priceLabel: { it: "a partire da", en: "from" },
  };

  it("accetta un servizio valido", () => {
    const result = ServiceFormSchema.safeParse(validService);
    expect(result.success).toBe(true);
  });

  it("accetta basePrice null (su richiesta)", () => {
    const result = ServiceFormSchema.safeParse({ ...validService, basePrice: null });
    expect(result.success).toBe(true);
  });

  it("accetta priceLabel null", () => {
    const result = ServiceFormSchema.safeParse({ ...validService, priceLabel: null });
    expect(result.success).toBe(true);
  });

  it("rifiuta slug con maiuscole", () => {
    const result = ServiceFormSchema.safeParse({ ...validService, slug: "Test-Slug" });
    expect(result.success).toBe(false);
  });

  it("rifiuta slug con spazi", () => {
    const result = ServiceFormSchema.safeParse({ ...validService, slug: "test slug" });
    expect(result.success).toBe(false);
  });

  it("rifiuta slug vuoto", () => {
    const result = ServiceFormSchema.safeParse({ ...validService, slug: "" });
    expect(result.success).toBe(false);
  });

  it("rifiuta order negativo", () => {
    const result = ServiceFormSchema.safeParse({ ...validService, order: -1 });
    expect(result.success).toBe(false);
  });

  it("rifiuta sconto senza prezzo base", () => {
    const result = ServiceFormSchema.safeParse({
      ...validService,
      basePrice: null,
      discountedPrice: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rifiuta sconto >= prezzo base", () => {
    const result = ServiceFormSchema.safeParse({
      ...validService,
      basePrice: 100,
      discountedPrice: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rifiuta sconto > prezzo base", () => {
    const result = ServiceFormSchema.safeParse({
      ...validService,
      basePrice: 100,
      discountedPrice: 150,
    });
    expect(result.success).toBe(false);
  });

  it("accetta sconto < prezzo base", () => {
    const result = ServiceFormSchema.safeParse({
      ...validService,
      basePrice: 100,
      discountedPrice: 80,
    });
    expect(result.success).toBe(true);
  });

  it("rifiuta imageUrl non valido", () => {
    const result = ServiceFormSchema.safeParse({ ...validService, imageUrl: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rifiuta title IT vuoto", () => {
    const result = ServiceFormSchema.safeParse({
      ...validService,
      title: { it: "", en: "Valid" },
    });
    expect(result.success).toBe(false);
  });

  it("accetta title EN vuoto (EN opzionale)", () => {
    const result = ServiceFormSchema.safeParse({
      ...validService,
      title: { it: "Valido", en: "" },
    });
    expect(result.success).toBe(true);
  });

  it("accetta imageUrl vuoto (immagine opzionale)", () => {
    const result = ServiceFormSchema.safeParse({ ...validService, imageUrl: "" });
    expect(result.success).toBe(true);
  });

  it("default images a array vuoto", () => {
    const { images, ...rest } = validService;
    const result = ServiceFormSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.images).toEqual([]);
    }
  });
});

describe("ServiceDocSchema", () => {
  it("accetta doc con campi extra (id, version, timestamps)", () => {
    const result = ServiceDocSchema.safeParse({
      id: "abc123",
      slug: "test",
      order: 0,
      inEvidenza: false,
      available: true,
      title: { it: "T", en: "T" },
      summary: { it: "S", en: "S" },
      description: { it: "D", en: "D" },
      benefits: { it: ["B"], en: ["B"] },
      faq: { it: [{ q: "Q", a: "A" }], en: [{ q: "Q", a: "A" }] },
      imageUrl: "https://example.com/img.jpg",
      images: [],
      basePrice: null,
      discountedPrice: null,
      priceLabel: null,
      version: 0,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      deletedAt: null,
    });
    expect(result.success).toBe(true);
  });
});
