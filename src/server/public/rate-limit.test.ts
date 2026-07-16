import { describe, it, expect } from "vitest";
import { isRateLimited, RATE_LIMIT_SCOPES } from "@/server/public/rate-limit-logic";

describe("isRateLimited", () => {
  it("conteggio sotto il limite → non limitato", () => {
    expect(isRateLimited(4, 5)).toBe(false);
  });

  it("conteggio pari al limite → limitato (la richiesta che lo supera è bloccata)", () => {
    expect(isRateLimited(5, 5)).toBe(true);
  });

  it("conteggio oltre il limite → limitato", () => {
    expect(isRateLimited(6, 5)).toBe(true);
  });

  it("conteggio zero → mai limitato", () => {
    expect(isRateLimited(0, 5)).toBe(false);
  });
});

describe("RATE_LIMIT_SCOPES — checkout", () => {
  it("checkout-ip: limit 5 → la 6ª richiesta nella finestra viene bloccata", () => {
    const { limit } = RATE_LIMIT_SCOPES["checkout-ip"];
    expect(limit).toBe(5);
    // Richieste 1-5 incrementano il contatore da 0 a 5 senza mai essere bloccate;
    // la 6ª richiesta trova count === 5 → isRateLimited(5, 5) === true.
    expect(isRateLimited(4, limit)).toBe(false); // 5ª richiesta: count era 4
    expect(isRateLimited(5, limit)).toBe(true); // 6ª richiesta: count è 5
  });

  it("checkout-email: limit 3 → la 4ª richiesta con la stessa email viene bloccata", () => {
    const { limit } = RATE_LIMIT_SCOPES["checkout-email"];
    expect(limit).toBe(3);
    expect(isRateLimited(2, limit)).toBe(false); // 3ª richiesta: count era 2
    expect(isRateLimited(3, limit)).toBe(true); // 4ª richiesta: count è 3
  });
});
