import { describe, it, expect } from "vitest";
import { EventFormSchema } from "@/schemas/event";
import { RecurrenceSchema } from "@/schemas/reminder";

const validRecurrence: ReturnType<typeof RecurrenceSchema.parse> = {
  rule: "monthly",
  interval: 1,
};

const validBase = {
  slug: "degustazione-vini-2026",
  title: { it: "Degustazione Vini 2026", en: "Wine Tasting 2026" },
  summary: { it: "Degustazione guidata", en: "Guided tasting" },
  description: { it: "", en: "" },
  previewImageUrl: "",
  imageUrl: "",
  images: [],
  location: { name: "Cantina Vinifera", address: "Via Tevere 1", city: "Roma" },
  startsAt: "2026-11-15T18:00",
  endsAt: null,
  bookingOpensAt: null,
  bookingClosesAt: null,
  capacity: 20,
  maxSeatsPerOrder: null,
  priceCents: 3000,        // 30,00 € — evento a pagamento
  discountedPriceCents: null,
  featured: false,
  recurrence: null,
};

describe("EventFormSchema — evento a pagamento", () => {
  it("accetta un evento a pagamento valido", () => {
    expect(EventFormSchema.safeParse(validBase).success).toBe(true);
  });

  it("accetta priceCents === 50 (minimo Stripe)", () => {
    expect(EventFormSchema.safeParse({ ...validBase, priceCents: 50 }).success).toBe(true);
  });

  it("rifiuta priceCents tra 1 e 49", () => {
    const r1 = EventFormSchema.safeParse({ ...validBase, priceCents: 1 });
    const r49 = EventFormSchema.safeParse({ ...validBase, priceCents: 49 });
    expect(r1.success).toBe(false);
    expect(r49.success).toBe(false);
  });

  it("accetta sconto valido (>= 50 e < priceCents)", () => {
    const r = EventFormSchema.safeParse({
      ...validBase,
      priceCents: 3000,
      discountedPriceCents: 2000,
    });
    expect(r.success).toBe(true);
  });

  it("rifiuta sconto >= priceCents", () => {
    const r = EventFormSchema.safeParse({
      ...validBase,
      priceCents: 3000,
      discountedPriceCents: 3000,
    });
    expect(r.success).toBe(false);
  });

  it("rifiuta sconto < 50 centesimi", () => {
    const r = EventFormSchema.safeParse({
      ...validBase,
      priceCents: 3000,
      discountedPriceCents: 49,
    });
    expect(r.success).toBe(false);
  });

  it("rifiuta capacity === 0", () => {
    expect(EventFormSchema.safeParse({ ...validBase, capacity: 0 }).success).toBe(false);
  });

  it("accetta recurrence valida", () => {
    expect(EventFormSchema.safeParse({ ...validBase, recurrence: validRecurrence }).success).toBe(true);
  });

  it("accetta maxSeatsPerOrder null (evento a pagamento — nessun limite)", () => {
    expect(EventFormSchema.safeParse({ ...validBase, maxSeatsPerOrder: null }).success).toBe(true);
  });
});

describe("EventFormSchema — evento gratuito (priceCents === 0)", () => {
  const freeBase = {
    ...validBase,
    priceCents: 0,
    maxSeatsPerOrder: 4, // obbligatorio per i gratuiti
  };

  it("accetta evento gratuito con maxSeatsPerOrder valorizzato", () => {
    expect(EventFormSchema.safeParse(freeBase).success).toBe(true);
  });

  it("rifiuta evento gratuito con maxSeatsPerOrder null", () => {
    const r = EventFormSchema.safeParse({ ...freeBase, maxSeatsPerOrder: null });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("maxSeatsPerOrder"))).toBe(true);
    }
  });

  it("rifiuta evento gratuito con maxSeatsPerOrder assente (undefined)", () => {
    // maxSeatsPerOrder default è null → deve essere rifiutato
    const withoutMax = Object.fromEntries(
      Object.entries(freeBase).filter(([k]) => k !== "maxSeatsPerOrder"),
    );
    const r = EventFormSchema.safeParse(withoutMax);
    expect(r.success).toBe(false);
  });

  it("rifiuta evento gratuito con discountedPriceCents valorizzato", () => {
    const r = EventFormSchema.safeParse({
      ...freeBase,
      discountedPriceCents: 1000,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("discountedPriceCents"))).toBe(true);
    }
  });

  it("accetta priceCents === 0 con discountedPriceCents null", () => {
    expect(EventFormSchema.safeParse({ ...freeBase, discountedPriceCents: null }).success).toBe(true);
  });
});
