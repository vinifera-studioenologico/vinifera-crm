import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: "unauthenticated" | "unauthorized" | "dev_bypass_in_prod",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * §18.11 §5.4 — Verifica che l'utente sia autenticato come admin.
 * Da chiamare come PRIMA istruzione in ogni Server Action e Route Handler.
 * In produzione ignora qualsiasi bypass dev.
 */
export async function requireAdmin(): Promise<{ uid: string; email: string }> {
  // Blocco assoluto in produzione per qualsiasi bypass
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true") {
    logger.error("DEV_BYPASS_AUTH=true in produzione — accesso bloccato");
    throw new AuthError("Bypass non consentito in produzione", "dev_bypass_in_prod");
  }

  // ── Dev bypass locale ────────────────────────────────────────────────────
  // Con NEXT_PUBLIC_DEV_BYPASS_AUTH=true restituisce un utente fake senza Firebase.
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true") {
    return { uid: "dev-bypass-uid", email: "dev@vinifera.local" };
  }
  // ────────────────────────────────────────────────────────────────────────

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("__session")?.value;

  if (!sessionCookie) {
    redirect("/login");
    // TypeScript narrow: redirect() lancia sempre un errore, ma il type
    // system non lo sa ancora senza `never` — il return sotto non è mai raggiunto
    return null as never;
  }

  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);

    if (decoded.role !== "admin") {
      logger.warn("Accesso negato: ruolo insufficiente", { uid: decoded.uid });
      // Redirige all'endpoint che cancella il cookie, altrimenti il
      // middleware continua a lasciar passare il vecchio cookie e si
      // genera un redirect loop tra /dashboard e /login.
      redirect("/api/auth/signout");
    }

    return { uid: decoded.uid, email: decoded.email ?? "" };
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw err;
    logger.warn("Verifica session cookie fallita", err);
    redirect("/api/auth/signout");
  }
}

/**
 * Crea un session cookie Firebase dal ID token (chiamato dopo login client-side).
 * Durata: 7 giorni.
 */
export async function createSessionCookie(idToken: string): Promise<string> {
  const expiresIn = 60 * 60 * 24 * 7 * 1000; // 7 giorni in ms
  return adminAuth.createSessionCookie(idToken, { expiresIn });
}

/**
 * Revoca i refresh token dell'utente (per logout sicuro).
 */
export async function revokeSession(uid: string): Promise<void> {
  await adminAuth.revokeRefreshTokens(uid);
}
