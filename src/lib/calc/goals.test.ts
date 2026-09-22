import { describe, it, expect } from "vitest";
import { computeGoalProgress } from "@/lib/calc/goals";

describe("computeGoalProgress", () => {
  it("returns null when target is not set", () => {
    expect(computeGoalProgress(undefined, 500, new Date(2026, 5, 15), 2026)).toBeNull();
  });

  it("returns 0% progress when current is 0", () => {
    const result = computeGoalProgress(10000, 0, new Date(2026, 0, 1), 2026);
    expect(result).toMatchObject({ target: 10000, current: 0, percent: 0, actualPercent: 0, remaining: 10000 });
  });

  it("caps percent at 100 but reports the real actualPercent past target", () => {
    const result = computeGoalProgress(10000, 13000, new Date(2026, 11, 31), 2026);
    expect(result!.percent).toBe(100);
    expect(result!.actualPercent).toBe(130);
    expect(result!.remaining).toBe(0); // mai negativo
  });

  it("is onTrack at the start of the year even with 0 progress", () => {
    // 1° gennaio, appena iniziato: la frazione d'anno attesa è ~0
    const result = computeGoalProgress(10000, 0, new Date(2026, 0, 1, 0, 0, 0), 2026);
    expect(result!.onTrack).toBe(true);
  });

  it("is onTrack at mid-year when progress matches elapsed time", () => {
    // 2 luglio ≈ metà anno; il 50% del target è in linea
    const result = computeGoalProgress(10000, 5000, new Date(2026, 6, 2), 2026);
    expect(result!.onTrack).toBe(true);
  });

  it("is NOT onTrack at mid-year when far behind", () => {
    const result = computeGoalProgress(10000, 1000, new Date(2026, 6, 2), 2026);
    expect(result!.onTrack).toBe(false);
  });

  it("is onTrack at year end only if the target was reached", () => {
    const behind = computeGoalProgress(10000, 9000, new Date(2026, 11, 31, 23, 59), 2026);
    expect(behind!.onTrack).toBe(false);

    const reached = computeGoalProgress(10000, 10000, new Date(2026, 11, 31, 23, 59), 2026);
    expect(reached!.onTrack).toBe(true);
  });

  it("treats a target of 0 as already met — never 'in ritardo' regardless of current or date", () => {
    // Un obiettivo di 0 non ha nulla da inseguire: dev'essere sempre onTrack,
    // anche il 2 gennaio (prima del fix, actualPercent=0 risultava "in ritardo").
    const zeroCurrentToo = computeGoalProgress(0, 0, new Date(2026, 0, 2), 2026);
    expect(zeroCurrentToo).toMatchObject({ target: 0, current: 0, percent: 100, actualPercent: 100, remaining: 0, onTrack: true });

    const someProgress = computeGoalProgress(0, 50, new Date(2026, 5, 1), 2026);
    expect(someProgress).toMatchObject({ target: 0, current: 50, percent: 100, actualPercent: 100, onTrack: true });
  });
});
