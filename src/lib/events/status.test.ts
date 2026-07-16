import { describe, it, expect } from "vitest";
import { derivePublicStatus, seatsAvailable, isFreeEvent, computeOverbookExcess } from "@/lib/events/status";

// ── Helper per costruire input minimal ───────────────────────────────
function makeEvent(overrides: Partial<Parameters<typeof derivePublicStatus>[0]> = {}) {
  return {
    status: "published" as const,
    startsAt: new Date("2026-12-01T18:00:00Z"),
    endsAt: null,
    bookingOpensAt: null,
    bookingClosesAt: null,
    capacity: 20,
    seatsSold: 0,
    seatsHeld: 0,
    ...overrides,
  };
}

const FUTURE = new Date("2026-11-01T00:00:00Z"); // prima dell'evento
const PAST   = new Date("2026-12-02T00:00:00Z"); // dopo l'evento

describe("derivePublicStatus", () => {
  it("restituisce null per evento in draft", () => {
    expect(derivePublicStatus(makeEvent({ status: "draft" }), FUTURE)).toBeNull();
  });

  it("restituisce cancelled per evento cancellato", () => {
    expect(derivePublicStatus(makeEvent({ status: "cancelled" }), FUTURE)).toBe("cancelled");
  });

  it("restituisce past quando now > startsAt (senza endsAt)", () => {
    expect(derivePublicStatus(makeEvent(), PAST)).toBe("past");
  });

  it("restituisce past quando now > endsAt", () => {
    const ev = makeEvent({
      startsAt: new Date("2026-12-01T18:00:00Z"),
      endsAt: new Date("2026-12-01T21:00:00Z"),
    });
    expect(derivePublicStatus(ev, new Date("2026-12-01T22:00:00Z"))).toBe("past");
  });

  it("restituisce upcoming quando now < bookingOpensAt", () => {
    const ev = makeEvent({
      bookingOpensAt: new Date("2026-11-15T00:00:00Z"),
    });
    expect(derivePublicStatus(ev, FUTURE)).toBe("upcoming");
  });

  it("restituisce past quando bookingClosesAt è già passato", () => {
    const ev = makeEvent({
      bookingClosesAt: new Date("2026-10-01T00:00:00Z"),
    });
    expect(derivePublicStatus(ev, FUTURE)).toBe("past");
  });

  it("restituisce bookable in condizioni normali", () => {
    expect(derivePublicStatus(makeEvent(), FUTURE)).toBe("bookable");
  });

  it("restituisce sold_out quando capacity - seatsSold - seatsHeld <= 0", () => {
    const ev = makeEvent({ capacity: 10, seatsSold: 8, seatsHeld: 2 });
    expect(derivePublicStatus(ev, FUTURE)).toBe("sold_out");
  });

  it("restituisce sold_out anche con hold che coprono i posti (overbooking da hold)", () => {
    const ev = makeEvent({ capacity: 5, seatsSold: 3, seatsHeld: 3 });
    expect(derivePublicStatus(ev, FUTURE)).toBe("sold_out");
  });

  it("accetta duck-typed timestamp { toDate() }", () => {
    const fakeTs = (d: Date) => ({ toDate: () => d });
    const ev = {
      status: "published" as const,
      startsAt: fakeTs(new Date("2026-12-01T18:00:00Z")),
      endsAt: null,
      bookingOpensAt: null,
      bookingClosesAt: null,
      capacity: 20,
      seatsSold: 0,
      seatsHeld: 0,
    };
    expect(derivePublicStatus(ev, FUTURE)).toBe("bookable");
  });
});

describe("seatsAvailable", () => {
  it("calcola correttamente i posti disponibili", () => {
    expect(seatsAvailable({ capacity: 20, seatsSold: 5, seatsHeld: 3 })).toBe(12);
  });

  it("restituisce valore negativo in overbooking", () => {
    expect(seatsAvailable({ capacity: 5, seatsSold: 4, seatsHeld: 3 })).toBe(-2);
  });
});

describe("isFreeEvent", () => {
  it("restituisce true per priceCents === 0", () => {
    expect(isFreeEvent({ priceCents: 0 })).toBe(true);
  });

  it("restituisce false per priceCents === 50", () => {
    expect(isFreeEvent({ priceCents: 50 })).toBe(false);
  });

  it("restituisce false per priceCents positivo qualsiasi", () => {
    expect(isFreeEvent({ priceCents: 1000 })).toBe(false);
  });
});

describe("computeOverbookExcess", () => {
  it("3 ordini paid da 2 posti (6 occupati), riduzione capienza a 4 → eccedenza 2", () => {
    expect(computeOverbookExcess(6, 4)).toBe(2);
  });

  it("occupied === capacity → null (nessun overbooking)", () => {
    expect(computeOverbookExcess(4, 4)).toBeNull();
  });

  it("occupied < capacity → null", () => {
    expect(computeOverbookExcess(3, 10)).toBeNull();
  });
});
