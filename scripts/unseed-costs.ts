/**
 * RIMOZIONE SEED MODULO COSTI
 *
 * ⚠️  AMBIENTE DI PRODUZIONE — MASSIMA CAUTELA ⚠️
 *
 * Questo script elimina ESCLUSIVAMENTE i documenti generati da seed-costs.ts,
 * riconoscibili perché il loro ID inizia con il prefisso "costseed-".
 * Nessun documento reale viene mai toccato:
 *   • si filtra in memoria per ID che inizia con "costseed-";
 *   • il documento settings/costs viene rimosso SOLO se contiene _seedManaged === true.
 *
 * Esegui con:
 *   npm run seed:costs:clean
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0]!;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

// ── Emulatori ─────────────────────────────────────────────────────────────────
const IS_EMULATOR = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";
if (!IS_EMULATOR) {
  console.error("❌ ABORT: NEXT_PUBLIC_USE_EMULATORS !== 'true'. Unseed consentito solo su emulatori.");
  process.exit(1);
}
process.env.FIRESTORE_EMULATOR_HOST ??= "localhost:8080";
console.log("\uD83D\uDCE1 Modalità emulatore: Firestore su localhost:8080\n");

getAdminApp();
const db = getFirestore();

/** SOLO i documenti il cui ID inizia con questo prefisso vengono eliminati. */
const SEED_PREFIX = "costseed-";

/** Collezioni toccate dal seed dei costi. */
const COLLECTIONS = ["analyses", "costFixedCosts", "costKits", "costExpenses"];

async function deleteSeededDocs(collection: string): Promise<number> {
  const snap = await db.collection(collection).get();

  // Filtro DIFENSIVO in memoria: elimina solo gli ID con il prefisso seed.
  const toDelete = snap.docs.filter((d) => d.id.startsWith(SEED_PREFIX));

  if (toDelete.length === 0) {
    console.log(`  ${collection}: nessun seed trovato`);
    return 0;
  }

  let count = 0;
  for (let i = 0; i < toDelete.length; i += 500) {
    const batch = db.batch();
    const slice = toDelete.slice(i, i + 500);
    slice.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    count += slice.length;
  }

  console.log(`  ${collection}: eliminati ${count} documenti`);
  return count;
}

async function unseed() {
  console.log("🗑  Rimozione seed modulo Costi (solo ID 'costseed-')...\n");

  let total = 0;
  for (const col of COLLECTIONS) {
    total += await deleteSeededDocs(col);
  }

  // settings/costs: rimosso SOLO se creato dal seed (_seedManaged === true).
  const settingsRef = db.collection("settings").doc("costs");
  const settingsSnap = await settingsRef.get();
  if (settingsSnap.exists && settingsSnap.data()?.["_seedManaged"] === true) {
    await settingsRef.delete();
    console.log("  settings/costs: eliminato (era _seedManaged)");
    total += 1;
  } else if (settingsSnap.exists) {
    console.log("  settings/costs: preservato (non creato dal seed)");
  } else {
    console.log("  settings/costs: assente");
  }

  console.log(`\n✅ Rimossi ${total} documenti seed del modulo Costi.`);
}

unseed().catch((err) => {
  console.error("❌ Unseed costi fallito:", err);
  process.exit(1);
});
