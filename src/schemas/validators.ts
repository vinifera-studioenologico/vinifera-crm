/**
 * Validatori italiani riutilizzabili per tutti gli schema Zod.
 * §16.1 — validazione locale it-IT.
 */
import { z } from "zod";

// P.IVA italiana: 11 cifre con check digit (algoritmo Luhn-like ufficiale)
export function validateVatNumber(value: string): boolean {
  if (!/^\d{11}$/.test(value)) return false;
  let s = 0;
  for (let i = 0; i <= 9; i += 2) {
    s += value.charCodeAt(i) - 48;
  }
  for (let i = 1; i <= 9; i += 2) {
    let d = 2 * (value.charCodeAt(i) - 48);
    if (d > 9) d -= 9;
    s += d;
  }
  // Il check digit (posizione 10) deve corrispondere a (10 - s%10) % 10
  const expected = (10 - (s % 10)) % 10;
  return expected === (value.charCodeAt(10) - 48);
}

// Codice fiscale italiano: 16 caratteri alfanumerici (formato, non check digit completo)
export function validateTaxCode(value: string): boolean {
  return /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST]{1}[0-9LMNPQRSTUV]{2}[A-Z]{1}[0-9LMNPQRSTUV]{3}[A-Z]{1}$/i.test(value);
}

// IBAN italiano: IT + 25 caratteri (27 totali)
export function validateIBAN(value: string): boolean {
  const normalized = value.replace(/\s/g, "").toUpperCase();
  if (!/^IT\d{2}[A-Z0-9]{23}$/.test(normalized)) return false;
  // MOD-97 check
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55),
  );
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + parseInt(ch, 10)) % 97;
  }
  return remainder === 1;
}

// Codice SDI: 7 caratteri alfanumerici (o "0000000" per privati)
export function validateSdiCode(value: string): boolean {
  return /^[A-Z0-9]{7}$/i.test(value);
}

// CAP italiano: 5 cifre
export const zipRegex = /^\d{5}$/;

// ── Helpers Zod riusabili ──────────────────────────────────────────────

export const zNonEmptyString = z.string().min(1, "Campo obbligatorio");

export const zEmail = z
  .string()
  .min(1, "Campo obbligatorio")
  .email("L'email non sembra valida");

export const zPhone = z
  .string()
  .min(6, "Numero di telefono non valido")
  .max(20, "Numero di telefono non valido")
  .regex(/^[+\d\s\-()]+$/, "Numero di telefono non valido");

export const zVatNumber = z
  .string()
  .min(1, "Campo obbligatorio")
  .refine(validateVatNumber, "P.IVA non valida (deve essere 11 cifre con check digit corretto)");

export const zTaxCode = z
  .string()
  .min(1, "Campo obbligatorio")
  .refine(validateTaxCode, "Codice fiscale non valido");

export const zIBAN = z
  .string()
  .min(1, "Campo obbligatorio")
  .refine((v) => validateIBAN(v), "IBAN non valido");

export const zSdiCode = z
  .string()
  .refine((v) => v === "" || validateSdiCode(v), "Codice SDI non valido (7 caratteri alfanumerici)");

export const zZip = z
  .string()
  .regex(zipRegex, "CAP non valido (5 cifre)");

// Importo in centesimi: numero intero non negativo (§18.1)
export const zCents = z
  .number()
  .int("L'importo deve essere un numero intero di centesimi")
  .min(0, "L'importo non può essere negativo");

// Stringa che rappresenta un importo EUR (input utente) → trasformata in centesimi
export const zEurInput = z
  .string()
  .min(1, "Campo obbligatorio")
  .transform((val) => {
    const normalized = val.replace(",", ".");
    const n = parseFloat(normalized);
    if (isNaN(n) || n < 0) throw new Error("Importo non valido");
    return Math.round(n * 100);
  })
  .pipe(zCents);

// Indirizzo (riusabile in client/company)
export const zAddress = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  zip: z.union([zZip, z.literal("")]).optional(),
  province: z.string().max(2, "Inserire la sigla (es. MI)").optional(),
  country: z.string().optional(),
});

export type Address = z.infer<typeof zAddress>;

// ── Validatori per il profilo di fatturazione eventi ──────────────────

// Codice fiscale — regex standard 16 caratteri (formato base, case-insensitive)
const cfRegex = /^[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]$/i;

export const zCodiceFiscale = z
  .string()
  .min(1, "Codice fiscale obbligatorio")
  .regex(cfRegex, "Codice fiscale non valido (16 caratteri)");

// P.IVA italiana — alias esplicito con messaggio ad hoc
export const zPartitaIva = z
  .string()
  .min(1, "Partita IVA obbligatoria")
  .refine(validateVatNumber, "Partita IVA non valida (11 cifre con check digit corretto)");

// Indirizzo di fatturazione (street + zip + city + province obbligatori)
export const zBillingAddress = z.object({
  street: z.string().min(1, "Via obbligatoria"),
  zip: zZip,
  city: z.string().min(1, "Città obbligatoria"),
  province: z.string().min(1, "Provincia obbligatoria").max(2, "Inserire la sigla (es. MI)"),
});
