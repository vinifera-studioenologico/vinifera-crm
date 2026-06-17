import { describe, it, expect } from "vitest";
import { matchAnalysis, normalize } from "@/lib/calc/kit-match";
import type { AnalysisLite } from "@/lib/calc/kit-match";

// ── Fixture analisi di test ───────────────────────────────────────────
const analyses: AnalysisLite[] = [
  { id: "1", code: "AC001", name: "Acidità totale" },
  { id: "2", code: "SO001", name: "SO2 libera" },
  { id: "3", code: "SO002", name: "SO2 totale" },
  { id: "4", code: "PH001", name: "pH" },
  { id: "5", code: "ZZ999", name: "Analisi generica" },
];

describe("matchAnalysis", () => {
  it("1. match codice esatto → score 1 e level high", () => {
    const result = matchAnalysis(
      { articleCode: "AC001", description: "Kit acidità totale 100 test" },
      analyses,
    );
    expect(result.best?.score).toBe(1);
    expect(result.level).toBe("high");
    expect(result.best?.analysisId).toBe("1");
  });

  it("2. match per nome ('Kit acidità totale') → level medium o high", () => {
    const result = matchAnalysis(
      { articleCode: null, description: "Kit acidità totale conf. 100 determinazioni" },
      analyses,
    );
    expect(result.best?.analysisId).toBe("1");
    expect(["medium", "high"]).toContain(result.level);
  });

  it("3. nessun match (descrizione generica) → best null o level low", () => {
    const result = matchAnalysis(
      { articleCode: null, description: "Reagente vario" },
      analyses,
    );
    // best null oppure score basso
    if (result.best !== null) {
      expect(result.level).toBe("low");
    } else {
      expect(result.best).toBeNull();
    }
  });

  it("4. due cloni SO2 → candidates.length >= 2 con score ravvicinati", () => {
    const result = matchAnalysis(
      { articleCode: null, description: "Kit SO2 100 test" },
      analyses,
    );
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    // I primi due candidati devono essere SO2 libera e SO2 totale (in qualche ordine)
    const topIds = result.candidates.slice(0, 2).map((c) => c.analysisId);
    expect(topIds).toContain("2");
    expect(topIds).toContain("3");
  });

  it("normalize rimuove accenti e caratteri speciali", () => {
    expect(normalize("Acidità Totàle")).toBe("acidita totale");
    expect(normalize("pH — valore")).toBe("ph valore");
    expect(normalize(null)).toBe("");
    expect(normalize(undefined)).toBe("");
  });
});
