import { describe, it, expect } from "vitest";
import { splitInCents, toCents, applyPercentCents } from "@/lib/utils/money";

describe("splitInCents", () => {
  it("divide uniformemente", () => {
    const result = splitInCents(900, 3);
    expect(result).toEqual([300, 300, 300]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(900);
  });

  it("distribuisce il resto sulle prime rate", () => {
    const result = splitInCents(1000, 3);
    // 334 + 333 + 333 = 1000
    expect(result[0]).toBe(334);
    expect(result[1]).toBe(333);
    expect(result[2]).toBe(333);
    expect(result.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("invariante: somma sempre uguale al totale", () => {
    for (const total of [1, 7, 100, 101, 999, 1000, 1001, 12345]) {
      for (const n of [1, 2, 3, 5, 7, 12]) {
        const result = splitInCents(total, n);
        expect(result.reduce((a, b) => a + b, 0)).toBe(total);
        expect(result).toHaveLength(n);
      }
    }
  });

  it("n=1 restituisce l'intero totale", () => {
    expect(splitInCents(5000, 1)).toEqual([5000]);
  });

  it("totale=0 restituisce rate tutte a zero", () => {
    expect(splitInCents(0, 3)).toEqual([0, 0, 0]);
  });

  it("lancia errore se n<=0", () => {
    expect(() => splitInCents(1000, 0)).toThrow();
  });
});

describe("toCents", () => {
  it("converte stringa italiana con virgola", () => {
    expect(toCents("12,50")).toBe(1250);
  });

  it("converte stringa con separatore migliaia", () => {
    expect(toCents("1.234,56")).toBe(123456);
  });

  it("converte numero float", () => {
    expect(toCents(12.5)).toBe(1250);
  });

  it("nessuna perdita di precisione su 0.1", () => {
    expect(toCents(0.1)).toBe(10);
  });

  it("nessuna perdita di precisione su 1.235 (arrotondamento)", () => {
    // 1.235 * 100 = 123.5 → Math.round → 124
    expect(toCents(1.235)).toBe(124);
  });

  it("stringa non valida restituisce 0", () => {
    expect(toCents("abc")).toBe(0);
  });
});

describe("applyPercentCents", () => {
  it("calcola IVA 22%", () => {
    expect(applyPercentCents(10000, 22)).toBe(2200);
  });

  it("calcola Enpaia 4%", () => {
    expect(applyPercentCents(10000, 4)).toBe(400);
  });

  it("arrotonda correttamente", () => {
    // 100 * 3% = 3 (non 3.0)
    expect(applyPercentCents(100, 3)).toBe(3);
  });
});
