/**
 * Matching deterministico descrizione offerta ↔ analisi interne.
 * Usato da `prepareKitImport` server-side. Non dipende dall'AI.
 */

export interface AnalysisLite {
  id: string;
  code: string;
  name: string;
}

export interface MatchCandidate {
  analysisId: string;
  code: string;
  name: string;
  score: number; // 0..1
}

export interface MatchResult {
  best: MatchCandidate | null;
  candidates: MatchCandidate[]; // ordinati per score desc, max 5
  level: "high" | "medium" | "low"; // high ≥ 0.8 · medium ≥ 0.5 · low < 0.5
}

export function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // rimuove accenti
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter((t) => t.length > 1));
}

/** Jaccard tra due insiemi di token. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export function matchAnalysis(
  line: { articleCode: string | null; description: string; name?: string },
  analyses: AnalysisLite[],
): MatchResult {
  const lineCode = normalize(line.articleCode);
  const haystack = `${line.name ?? ""} ${line.description}`;
  const lineTokens = tokens(haystack);
  const normHaystack = normalize(haystack);

  const scored: MatchCandidate[] = analyses.map((a) => {
    // 1) match codice esatto (raro ma fortissimo)
    if (lineCode && normalize(a.code) === lineCode) {
      return { analysisId: a.id, code: a.code, name: a.name, score: 1 };
    }
    // 2) similarità sul nome
    const j = jaccard(lineTokens, tokens(a.name));
    // bonus se il nome analisi è interamente contenuto nella descrizione
    const contained = normHaystack.includes(normalize(a.name)) ? 0.25 : 0;
    const score = Math.min(1, j + contained);
    return { analysisId: a.id, code: a.code, name: a.name, score };
  });

  scored.sort((x, y) => y.score - x.score);
  const candidates = scored.slice(0, 5).filter((c) => c.score > 0);
  const best = candidates[0] ?? null;
  const level: MatchResult["level"] =
    !best ? "low" : best.score >= 0.8 ? "high" : best.score >= 0.5 ? "medium" : "low";

  return { best, candidates, level };
}
