/**
 * Avanzamento di un obiettivo annuale rispetto al valore corrente.
 * Funzione PURA — nessuna dipendenza da Firestore.
 */

export interface GoalMetricProgress {
  target: number;
  current: number;
  /** Percentuale limitata a 100, per la barra di avanzamento. */
  percent: number;
  /** Percentuale reale, non limitata: può superare 100 (es. 130). */
  actualPercent: number;
  /** Quanto manca al target, mai negativo. */
  remaining: number;
  /** Percentuale raggiunta >= frazione dell'anno trascorsa. */
  onTrack: boolean;
}

/**
 * @param target Valore obiettivo. `undefined` → nessun obiettivo impostato per questa metrica.
 * @param current Valore corrente calcolato dai dati reali.
 * @param now Istante di riferimento (per calcolare la frazione d'anno trascorsa).
 * @param year Anno dell'obiettivo (per i confini inizio/fine anno).
 */
export function computeGoalProgress(
  target: number | undefined,
  current: number,
  now: Date,
  year: number,
): GoalMetricProgress | null {
  if (target == null) return null;

  const actualPercent = target > 0 ? Math.round((current / target) * 100) : current > 0 ? 100 : 0;
  const percent = Math.min(100, actualPercent);
  const remaining = Math.max(0, target - current);

  const yearStart = new Date(year, 0, 1).getTime();
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999).getTime();
  const elapsedFraction = Math.min(1, Math.max(0, (now.getTime() - yearStart) / (yearEnd - yearStart)));
  const expectedPercent = elapsedFraction * 100;

  const onTrack = actualPercent >= expectedPercent;

  return { target, current, percent, actualPercent, remaining, onTrack };
}
