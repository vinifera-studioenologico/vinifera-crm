import "server-only";

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getStorage, type Storage } from "firebase-admin/storage";

// ── Dev stub ──────────────────────────────────────────────────────────────────
// In dev bypass mode (NEXT_PUBLIC_DEV_BYPASS_AUTH=true) Firebase Admin non è
// inizializzato. Restituiamo un Proxy ricorsivo che:
// - è sincrono per i builder di query (.where, .orderBy, .collection, .doc, ecc.)
// - restituisce Promise vuote per i terminatori (.get, .set, .update, .delete, .add)
const ASYNC_METHODS = new Set(["get", "set", "update", "delete", "add", "create"]);


function makeDevStub(): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  return new Proxy(
    function () { /* callable */ } as unknown as object,
    {
      get(_t, prop) {
        if (prop === "then") return undefined; // non è una Promise
        if (prop === "docs") return [];
        if (prop === "empty") return true;
        if (prop === "size") return 0;
        if (prop === "exists") return false;
        if (prop === "id") return "dev-stub-id";
        if (prop === "path") return "dev/stub";
        if (prop === Symbol.toPrimitive || prop === "valueOf" || prop === "toString") return () => "dev-stub";
        if (prop === "data") return () => ({});
        if (prop === "forEach") return () => {};
        // Terminatori asincroni → restituiscono Promise
        if (typeof prop === "string" && ASYNC_METHODS.has(prop)) {
          return () => Promise.resolve(makeDevStub());
        }
        return makeDevStub();
      },
      // Builder di query (collectionGroup, collection, doc, where, orderBy…) → sincrono
      apply() {
        return makeDevStub();
      },
      // Accesso a proprietà numeriche (es. docs[0])
      has() { return true; },
    },
  );
}

// ── Emulators ─────────────────────────────────────────────────────────────────
// Quando NEXT_PUBLIC_USE_EMULATORS=true, l'Admin SDK punta agli emulatori locali.
// Le env var devono essere impostate PRIMA dell'init (la SDK le legge a quel punto).
const USE_EMULATORS =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

if (USE_EMULATORS) {
  // 127.0.0.1 (non "localhost"): su Windows "localhost" può risolvere su IPv6 (::1)
  // mentre gli emulatori Firebase ascoltano su IPv4 → ECONNREFUSED ::1:8080.
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "http://127.0.0.1:9099";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
}

const IS_DEV_BYPASS =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true" &&
  !USE_EMULATORS; // gli emulatori hanno precedenza sul bypass

// ── Real Firebase Admin ───────────────────────────────────────────────────────
function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]!;

  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

// Lazy proxy — Firebase Admin viene inizializzato solo alla prima chiamata runtime.
// In dev bypass restituisce lo stub silenzioso.
function lazyProxy<T extends object>(factory: () => T): T {
  if (IS_DEV_BYPASS) return makeDevStub() as T;
  let instance: T | null = null;
  return new Proxy({} as T, {
    get(_target, prop, receiver) {
      if (!instance) instance = factory();
      return Reflect.get(instance as object, prop, receiver);
    },
  });
}

export const adminDb: Firestore = lazyProxy(() => getFirestore(getAdminApp()));
export const adminAuth: Auth = lazyProxy(() => getAuth(getAdminApp()));
export const adminStorage: Storage = lazyProxy(() => getStorage(getAdminApp()));
