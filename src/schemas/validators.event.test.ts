import { describe, it, expect } from "vitest";
import { BillingProfileSchema } from "@/schemas/eventOrder";
import { zCodiceFiscale, zPartitaIva } from "@/schemas/validators";

describe("zCodiceFiscale", () => {
  it("accetta CF valido maiuscolo", () => {
    expect(zCodiceFiscale.safeParse("RSSMRA85T10A562S").success).toBe(true);
  });

  it("accetta CF valido minuscolo (case-insensitive)", () => {
    expect(zCodiceFiscale.safeParse("rssmra85t10a562s").success).toBe(true);
  });

  it("rifiuta CF troppo corto", () => {
    expect(zCodiceFiscale.safeParse("RSSMRA85T10A562").success).toBe(false);
  });

  it("rifiuta CF con caratteri non validi", () => {
    expect(zCodiceFiscale.safeParse("RSSMRA85T10A562!").success).toBe(false);
  });

  it("rifiuta stringa vuota", () => {
    expect(zCodiceFiscale.safeParse("").success).toBe(false);
  });
});

describe("zPartitaIva", () => {
  it("accetta P.IVA valida (12345678903)", () => {
    expect(zPartitaIva.safeParse("12345678903").success).toBe(true);
  });

  it("accetta P.IVA con tutti zeri", () => {
    expect(zPartitaIva.safeParse("00000000000").success).toBe(true);
  });

  it("rifiuta P.IVA con lunghezza errata", () => {
    expect(zPartitaIva.safeParse("1234567890").success).toBe(false);
    expect(zPartitaIva.safeParse("123456789012").success).toBe(false);
  });

  it("rifiuta P.IVA con check digit sbagliato", () => {
    expect(zPartitaIva.safeParse("12345678901").success).toBe(false);
  });

  it("rifiuta stringa vuota", () => {
    expect(zPartitaIva.safeParse("").success).toBe(false);
  });
});

describe("BillingProfileSchema — privato", () => {
  const validPrivate = {
    type: "private" as const,
    firstName: "Mario",
    lastName: "Rossi",
    taxCode: "RSSMRA85T10A562S",
    address: { street: "Via Roma 1", zip: "00100", city: "Roma", province: "RM" },
  };

  it("accetta profilo privato valido", () => {
    expect(BillingProfileSchema.safeParse(validPrivate).success).toBe(true);
  });

  it("rifiuta profilo privato con CF errato", () => {
    const r = BillingProfileSchema.safeParse({ ...validPrivate, taxCode: "INVALID" });
    expect(r.success).toBe(false);
  });

  it("rifiuta CAP non valido (non 5 cifre)", () => {
    const r = BillingProfileSchema.safeParse({
      ...validPrivate,
      address: { ...validPrivate.address, zip: "1234" },
    });
    expect(r.success).toBe(false);
  });
});

describe("BillingProfileSchema — azienda", () => {
  const validCompany = {
    type: "company" as const,
    businessName: "Vinifera S.r.l.",
    vatNumber: "12345678903",
    sdiCode: "ABC1234",
    pec: null,
    taxCode: null,
    adminContactName: "Luca Bianchi",
    address: { street: "Via Tevere 10", zip: "00198", city: "Roma", province: "RM" },
  };

  it("accetta azienda con solo SDI", () => {
    expect(BillingProfileSchema.safeParse(validCompany).success).toBe(true);
  });

  it("accetta azienda con solo PEC", () => {
    const r = BillingProfileSchema.safeParse({
      ...validCompany,
      sdiCode: null,
      pec: "fatturazione@vinifera.it",
    });
    expect(r.success).toBe(true);
  });

  it("accetta azienda con SDI e PEC entrambi valorizzati", () => {
    const r = BillingProfileSchema.safeParse({
      ...validCompany,
      pec: "fatturazione@vinifera.it",
    });
    expect(r.success).toBe(true);
  });

  it("rifiuta azienda senza né SDI né PEC", () => {
    const r = BillingProfileSchema.safeParse({
      ...validCompany,
      sdiCode: null,
      pec: null,
    });
    expect(r.success).toBe(false);
  });

  it("rifiuta azienda con P.IVA non valida", () => {
    const r = BillingProfileSchema.safeParse({ ...validCompany, vatNumber: "12345678901" });
    expect(r.success).toBe(false);
  });

  it("rifiuta SDI con formato errato (< 7 caratteri)", () => {
    const r = BillingProfileSchema.safeParse({ ...validCompany, sdiCode: "ABC123" });
    expect(r.success).toBe(false);
  });
});
