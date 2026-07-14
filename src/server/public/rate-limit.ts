import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

// ── Costanti scope/limiti ─────────────────────────────────────────────
export const RATE_LIMIT_SCOPES = {
  /** 5 tentativi di checkout per IP in 10 minuti */
  "checkout-ip": { limit: 5, windowMs: 10 * 60 * 1000 },
  /** 3 tentativi di checkout per email in 10 minuti */
  "checkout-email": { limit: 3, windowMs: 10 * 60 * 1000 },
  /** 5 iscrizioni alla mailing list per IP in 60 minuti */
  "subscribe-ip": { limit: 5, windowMs: 60 * 60 * 1000 },
} as const;

export type RateLimitScope = keyof typeof RATE_LIMIT_SCOPES;

const COL = "rateLimits";

/**
 * Controlla e incrementa il contatore rate-limit per scope+key nella finestra corrente.
 * Usa una transazione Firestore per serializzare accessi concorrenti.
 *
 * @returns `true` se la richiesta è consentita, `false` se il limite è stato superato.
 */
export async function checkRateLimit(
  scope: RateLimitScope,
  key: string,
  limit?: number,
  windowMs?: number,
): Promise<boolean> {
  const defaults = RATE_LIMIT_SCOPES[scope];
  const effectiveLimit = limit ?? defaults.limit;
  const effectiveWindowMs = windowMs ?? defaults.windowMs;

  const now = Date.now();
  const windowStart = Math.floor(now / effectiveWindowMs) * effectiveWindowMs;
  const docId = `${scope}:${key}:${windowStart}`;
  const ref = adminDb.collection(COL).doc(docId);
  const expiresAt = Timestamp.fromMillis(windowStart + effectiveWindowMs + 5000); // +5s grace

  let allowed = false;

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current: number = snap.exists ? (snap.data()?.["count"] ?? 0) : 0;

    if (current >= effectiveLimit) {
      allowed = false;
      return;
    }

    if (!snap.exists) {
      tx.set(ref, { count: 1, expiresAt });
    } else {
      tx.update(ref, { count: FieldValue.increment(1) });
    }
    allowed = true;
  });

  return allowed;
}
