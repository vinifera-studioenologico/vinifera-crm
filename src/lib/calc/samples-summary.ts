/**
 * Riepilogo analisi in corso per categoria (sezione campioni).
 * Funzione PURA.
 */

import type { SampleDoc } from "@/schemas/sample";
import type { AnalysisDoc } from "@/schemas/analysis";

export interface CategoryAnalysisRow {
  analysisId: string;
  code: string;
  name: string;
  hasResult: boolean;
}

export interface CategorySampleGroup {
  sampleId: string;
  code: string;
  sampleName: string;
  clientName: string;
  rows: CategoryAnalysisRow[];
}

export interface CategorySummary {
  key: string; // categoria normalizzata, "" per il bucket senza categoria
  label: string; // etichetta da mostrare
  count: number; // totale analisi in corso della categoria
  groups: CategorySampleGroup[];
}

const UNCATEGORIZED_KEY = "";
const UNCATEGORIZED_LABEL = "Senza categoria";

/**
 * Raggruppa le analisi dei campioni passati in input (il filtro di stato lo
 * fa il chiamante) per categoria. Le categorie si normalizzano (trim,
 * case-insensitive) per il raggruppamento ma si mostrano con la grafia del
 * catalogo. Un'analisi non più presente nel catalogo (`analysisId` senza
 * corrispondenza) finisce nel bucket "Senza categoria" invece di far
 * fallire il raggruppamento.
 */
export function groupInProgressAnalysesByCategory(
  samples: SampleDoc[],
  analyses: AnalysisDoc[],
): CategorySummary[] {
  const analysisById = new Map(analyses.map((a) => [a.id, a]));

  const categories = new Map<
    string,
    { label: string; groups: Map<string, CategorySampleGroup> }
  >();

  for (const sample of samples) {
    for (const item of sample.items) {
      const analysis = analysisById.get(item.analysisId);
      const rawCategory = analysis?.category?.trim();
      const key = rawCategory ? rawCategory.toLowerCase() : UNCATEGORIZED_KEY;
      const label = rawCategory || UNCATEGORIZED_LABEL;

      let category = categories.get(key);
      if (!category) {
        category = { label, groups: new Map() };
        categories.set(key, category);
      }

      let group = category.groups.get(sample.id);
      if (!group) {
        group = {
          sampleId: sample.id,
          code: sample.code,
          sampleName: sample.sampleName,
          clientName: sample.clientNameSnapshot,
          rows: [],
        };
        category.groups.set(sample.id, group);
      }

      group.rows.push({
        analysisId: item.analysisId,
        code: item.analysisCodeSnapshot,
        name: item.analysisNameSnapshot,
        hasResult: Boolean(item.result?.trim()),
      });
    }
  }

  const summaries: CategorySummary[] = [...categories.entries()].map(([key, category]) => {
    const groups = [...category.groups.values()].sort((a, b) => a.code.localeCompare(b.code));
    const count = groups.reduce((acc, group) => acc + group.rows.length, 0);
    return { key, label: category.label, count, groups };
  });

  summaries.sort((a, b) => {
    if (a.key === UNCATEGORIZED_KEY) return 1;
    if (b.key === UNCATEGORIZED_KEY) return -1;
    return b.count - a.count;
  });

  return summaries;
}
