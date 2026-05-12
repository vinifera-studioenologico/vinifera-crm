import { describe, it, expect } from "vitest";
import {
  validateVatNumber,
  validateTaxCode,
  validateIBAN,
  validateSdiCode,
} from "@/schemas/validators";

describe("validateVatNumber (P.IVA italiana)", () => {
  it("accetta P.IVA valida", () => {
    // "12345678903": somma posizioni 0-9 = 47, check digit = (10-7)%10 = 3 ✓
    expect(validateVatNumber("12345678903")).toBe(true);
  });

  it("accetta altra P.IVA valida", () => {
    // Verifica con tutti zeri tranne check digit 0
    expect(validateVatNumber("00000000000")).toBe(true);
  });

  it("rifiuta P.IVA con lunghezza errata", () => {
    expect(validateVatNumber("1234567890")).toBe(false);   // 10 cifre
    expect(validateVatNumber("123456789012")).toBe(false); // 12 cifre
  });

  it("rifiuta P.IVA con lettere", () => {
    expect(validateVatNumber("1234567890A")).toBe(false);
  });

  it("rifiuta P.IVA con check digit sbagliato", () => {
    // check digit corretto è 3, non 1
    expect(validateVatNumber("12345678901")).toBe(false);
  });
});

describe("validateTaxCode (Codice Fiscale)", () => {
  it("accetta CF valido in maiuscolo", () => {
    expect(validateTaxCode("RSSMRA85T10A562S")).toBe(true);
  });

  it("accetta CF valido in minuscolo (case-insensitive)", () => {
    expect(validateTaxCode("rssmra85t10a562s")).toBe(true);
  });

  it("rifiuta CF troppo corto", () => {
    expect(validateTaxCode("RSSMRA85T10A562")).toBe(false);
  });

  it("rifiuta CF con caratteri non validi", () => {
    expect(validateTaxCode("RSSMRA85T10A562!")).toBe(false);
  });
});

describe("validateIBAN (IBAN italiano)", () => {
  it("accetta IBAN IT valido", () => {
    // IBAN di test per Intesa Sanpaolo (pubblico, non reale)
    expect(validateIBAN("IT60X0542811101000000123456")).toBe(true);
  });

  it("accetta IBAN con spazi (li ignora)", () => {
    expect(validateIBAN("IT60 X054 2811 1010 0000 0123 456")).toBe(true);
  });

  it("rifiuta IBAN con country code errato", () => {
    expect(validateIBAN("DE89370400440532013000")).toBe(false);
  });

  it("rifiuta IBAN con check digit errato", () => {
    expect(validateIBAN("IT00X0542811101000000123456")).toBe(false);
  });
});

describe("validateSdiCode (Codice SDI)", () => {
  it("accetta codice SDI alfanumerico valido", () => {
    expect(validateSdiCode("ABC1234")).toBe(true);
    expect(validateSdiCode("0000000")).toBe(true);
  });

  it("rifiuta codice SDI troppo corto", () => {
    expect(validateSdiCode("ABC123")).toBe(false);
  });

  it("rifiuta codice SDI con caratteri speciali", () => {
    expect(validateSdiCode("ABC-123")).toBe(false);
  });
});
