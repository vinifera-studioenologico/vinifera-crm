import { describe, it, expect } from "vitest";
import { normalizeEmail, normalizePhone } from "@/lib/events/normalize";

describe("normalizeEmail", () => {
  it("converte in minuscolo e rimuove spazi", () => {
    expect(normalizeEmail("  Mario.Rossi@Example.COM  ")).toBe("mario.rossi@example.com");
  });

  it("lascia invariata un'email già normalizzata", () => {
    expect(normalizeEmail("mario@example.it")).toBe("mario@example.it");
  });
});

describe("normalizePhone", () => {
  it("+39 333 1234567 → 3331234567", () => {
    expect(normalizePhone("+39 333 1234567")).toBe("3331234567");
  });

  it("3331234567 → 3331234567 (già normalizzato)", () => {
    expect(normalizePhone("3331234567")).toBe("3331234567");
  });

  it("0039333 1234567 → 3331234567", () => {
    expect(normalizePhone("0039333 1234567")).toBe("3331234567");
  });

  it("00393331234567 → 3331234567 (senza spazi)", () => {
    expect(normalizePhone("00393331234567")).toBe("3331234567");
  });

  it("+393331234567 → 3331234567 (senza spazi)", () => {
    expect(normalizePhone("+393331234567")).toBe("3331234567");
  });

  it("rimuove tutti i caratteri non cifre (trattini, punti, parentesi)", () => {
    expect(normalizePhone("(0039) 333-1234567")).toBe("3331234567");
  });

  it("non rimuove prefisso se il numero ha esattamente 10 cifre con 39", () => {
    // "3912345678" → 10 cifre, starts with "39" ma length === 10, NON rimuovere
    expect(normalizePhone("3912345678")).toBe("3912345678");
  });
});
