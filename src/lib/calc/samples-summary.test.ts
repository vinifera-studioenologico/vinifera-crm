import { describe, it, expect } from "vitest";
import { groupInProgressAnalysesByCategory } from "@/lib/calc/samples-summary";
import type { SampleDoc, SampleItem } from "@/schemas/sample";
import type { AnalysisDoc } from "@/schemas/analysis";

function makeItem(overrides: Partial<SampleItem> & Pick<SampleItem, "analysisId">): SampleItem {
  return {
    analysisCodeSnapshot: "AN-001",
    analysisNameSnapshot: "Analisi",
    unitPriceCents: 1000,
    chargeAnyway: false,
    ...overrides,
  };
}

function makeSample(overrides: Partial<SampleDoc> & Pick<SampleDoc, "id" | "items">): SampleDoc {
  return {
    code: "C-2026-0001",
    clientId: "client-1",
    clientNameSnapshot: "Cliente Test",
    sampleName: "Campione Test",
    receivedAt: "2026-09-01T00:00:00.000Z",
    status: "in_progress",
    estimatedTotalCents: 0,
    version: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<AnalysisDoc> & Pick<AnalysisDoc, "id">): AnalysisDoc {
  return {
    code: "AN-001",
    name: "Analisi",
    defaultPriceCents: 1000,
    active: true,
    version: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("groupInProgressAnalysesByCategory", () => {
  it("conta le analisi, non i campioni: un campione con 3 analisi della stessa categoria conta 3", () => {
    const analyses = [makeAnalysis({ id: "a1", category: "Chimiche" })];
    const samples = [
      makeSample({
        id: "s1",
        items: [
          makeItem({ analysisId: "a1" }),
          makeItem({ analysisId: "a1" }),
          makeItem({ analysisId: "a1" }),
        ],
      }),
    ];

    const result = groupInProgressAnalysesByCategory(samples, analyses);

    expect(result).toHaveLength(1);
    expect(result[0]!.count).toBe(3);
    expect(result[0]!.groups).toHaveLength(1);
    expect(result[0]!.groups[0]!.rows).toHaveLength(3);
  });

  it("mette in 'Senza categoria' le analisi con categoria mancante o stringa vuota", () => {
    const analyses = [
      makeAnalysis({ id: "a1" }), // category undefined
      makeAnalysis({ id: "a2", category: "" }),
    ];
    const samples = [
      makeSample({
        id: "s1",
        items: [makeItem({ analysisId: "a1" }), makeItem({ analysisId: "a2" })],
      }),
    ];

    const result = groupInProgressAnalysesByCategory(samples, analyses);

    expect(result).toHaveLength(1);
    expect(result[0]!.key).toBe("");
    expect(result[0]!.label).toBe("Senza categoria");
    expect(result[0]!.count).toBe(2);
  });

  it("unisce grafie diverse della stessa categoria in un'unica card", () => {
    const analyses = [
      makeAnalysis({ id: "a1", category: "Chimiche" }),
      makeAnalysis({ id: "a2", category: "chimiche " }),
    ];
    const samples = [
      makeSample({
        id: "s1",
        items: [makeItem({ analysisId: "a1" }), makeItem({ analysisId: "a2" })],
      }),
    ];

    const result = groupInProgressAnalysesByCategory(samples, analyses);

    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe("Chimiche");
    expect(result[0]!.count).toBe(2);
  });

  it("un'analisi non più nel catalogo finisce in 'Senza categoria' senza far crashare il raggruppamento", () => {
    const analyses = [makeAnalysis({ id: "a1", category: "Chimiche" })];
    const samples = [
      makeSample({
        id: "s1",
        items: [makeItem({ analysisId: "a1" }), makeItem({ analysisId: "deleted-analysis" })],
      }),
    ];

    const result = () => groupInProgressAnalysesByCategory(samples, analyses);

    expect(result).not.toThrow();
    const summary = result();
    expect(summary).toHaveLength(2);
    const uncategorized = summary.find((c) => c.key === "");
    expect(uncategorized?.count).toBe(1);
  });

  it("ordina le categorie per conteggio decrescente, con 'Senza categoria' sempre in fondo", () => {
    const analyses = [
      makeAnalysis({ id: "a1", category: "Chimiche" }),
      makeAnalysis({ id: "a2", category: "Microbiologiche" }),
    ];
    const samples = [
      makeSample({
        id: "s1",
        items: [
          makeItem({ analysisId: "a1" }),
          makeItem({ analysisId: "a2" }),
          makeItem({ analysisId: "a2" }),
          makeItem({ analysisId: "unknown" }),
        ],
      }),
    ];

    const result = groupInProgressAnalysesByCategory(samples, analyses);

    expect(result.map((c) => c.label)).toEqual(["Microbiologiche", "Chimiche", "Senza categoria"]);
  });

  it("nessun campione in input produce un array vuoto", () => {
    expect(groupInProgressAnalysesByCategory([], [])).toEqual([]);
  });
});
