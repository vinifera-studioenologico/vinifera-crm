import "server-only";

import { logger } from "@/lib/logger";

/**
 * §18.5 — Pattern after-commit.
 * Esegue fn() (che include la transazione Firestore), poi pianifica i side-effects
 * (email, Telegram, aggiornamento stats) DOPO il commit, senza bloccare la risposta.
 */
export async function withAfterCommit<T>(
  fn: () => Promise<T>,
  sideEffects: (result: T) => Promise<void>,
): Promise<T> {
  const result = await fn();
  // Fire-and-forget: non blocca la risposta al client
  queueMicrotask(() => {
    sideEffects(result).catch((err) => logger.error("After-commit side-effect fallito", err));
  });
  return result;
}
