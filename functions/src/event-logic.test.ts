import { describe, it, expect } from "vitest";
import {
  computeNextOccurrence,
  shouldReleaseHold,
  buildNewEventSlug,
  shiftDate,
} from "./event-logic";

describe("computeNextOccurrence", () => {
  const base = new Date("2026-11-15T18:00:00Z");

  it("monthly interval 1 → +1 mese", () => {
    const next = computeNextOccurrence(base, "monthly", 1);
    expect(next.toISOString()).toBe("2026-12-15T18:00:00.000Z");
  });

  it("monthly interval 2 → +2 mesi", () => {
    const next = computeNextOccurrence(base, "monthly", 2);
    expect(next.toISOString()).toBe("2027-01-15T18:00:00.000Z");
  });

  it("daily interval 1 → +1 giorno", () => {
    const next = computeNextOccurrence(base, "daily", 1);
    expect(next.toISOString()).toBe("2026-11-16T18:00:00.000Z");
  });

  it("weekly interval 1 → +7 giorni", () => {
    const next = computeNextOccurrence(base, "weekly", 1);
    expect(next.toISOString()).toBe("2026-11-22T18:00:00.000Z");
  });

  it("yearly interval 1 → +1 anno", () => {
    const next = computeNextOccurrence(base, "yearly", 1);
    expect(next.toISOString()).toBe("2027-11-15T18:00:00.000Z");
  });

  it("non muta la data originale", () => {
    computeNextOccurrence(base, "monthly", 1);
    expect(base.toISOString()).toBe("2026-11-15T18:00:00.000Z");
  });
});

describe("shouldReleaseHold", () => {
  const now = new Date("2026-11-01T12:00:00Z");

  it("hold scaduto da più del grace period → true", () => {
    const holdExpiresAt = new Date(now.getTime() - 91_000);
    expect(shouldReleaseHold(holdExpiresAt, now)).toBe(true);
  });

  it("hold scaduto da meno del grace period → false (aspetta il webhook)", () => {
    const holdExpiresAt = new Date(now.getTime() - 30_000);
    expect(shouldReleaseHold(holdExpiresAt, now)).toBe(false);
  });

  it("hold non ancora scaduto → false", () => {
    const holdExpiresAt = new Date(now.getTime() + 60_000);
    expect(shouldReleaseHold(holdExpiresAt, now)).toBe(false);
  });

  it("esattamente al bordo del grace period (90s) → true (<=)", () => {
    const holdExpiresAt = new Date(now.getTime() - 90_000);
    expect(shouldReleaseHold(holdExpiresAt, now)).toBe(true);
  });

  it("grace period custom rispettato", () => {
    const holdExpiresAt = new Date(now.getTime() - 10_000);
    expect(shouldReleaseHold(holdExpiresAt, now, 5)).toBe(true);
    expect(shouldReleaseHold(holdExpiresAt, now, 20)).toBe(false);
  });
});

describe("buildNewEventSlug", () => {
  it("aggiunge la data YYYY-MM-DD allo slug base", () => {
    const newStartsAt = new Date("2026-12-15T18:00:00Z");
    expect(buildNewEventSlug("degustazione-vini", newStartsAt)).toBe(
      "degustazione-vini-2026-12-15",
    );
  });

  it("sostituisce una data precedente già presente nello slug", () => {
    const newStartsAt = new Date("2027-01-15T18:00:00Z");
    expect(buildNewEventSlug("degustazione-vini-2026-12-15", newStartsAt)).toBe(
      "degustazione-vini-2027-01-15",
    );
  });

  it("padda mese e giorno a due cifre", () => {
    const newStartsAt = new Date("2026-03-05T18:00:00Z");
    expect(buildNewEventSlug("evento", newStartsAt)).toBe("evento-2026-03-05");
  });
});

describe("shiftDate", () => {
  it("null → null", () => {
    expect(shiftDate(null, 1000)).toBeNull();
  });

  it("applica il delta in millisecondi", () => {
    const date = new Date("2026-11-01T10:00:00Z");
    const deltaMs = 24 * 60 * 60 * 1000; // +1 giorno
    expect(shiftDate(date, deltaMs)!.toISOString()).toBe("2026-11-02T10:00:00.000Z");
  });

  it("delta negativo sposta indietro", () => {
    const date = new Date("2026-11-01T10:00:00Z");
    expect(shiftDate(date, -60_000)!.toISOString()).toBe("2026-11-01T09:59:00.000Z");
  });
});
