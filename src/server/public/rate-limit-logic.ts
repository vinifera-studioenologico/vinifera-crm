/**
 * Logica pura del rate limiting — nessuna dipendenza da Firestore/server-only.
 * Importabile dai test Vitest senza side-effects server.
 */

export const RATE_LIMIT_SCOPES = {
  /** 5 tentativi di checkout per IP in 10 minuti */
  "checkout-ip": { limit: 5, windowMs: 10 * 60 * 1000 },
  /** 3 tentativi di checkout per email in 10 minuti */
  "checkout-email": { limit: 3, windowMs: 10 * 60 * 1000 },
  /** 5 iscrizioni alla mailing list per IP in 60 minuti */
  "subscribe-ip": { limit: 5, windowMs: 60 * 60 * 1000 },
} as const;

export type RateLimitScope = keyof typeof RATE_LIMIT_SCOPES;

/**
 * Decisione pura: la richiesta corrente supera il limite?
 */
export function isRateLimited(currentCount: number, limit: number): boolean {
  return currentCount >= limit;
}
