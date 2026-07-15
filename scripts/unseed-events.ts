/**
 * RIMOZIONE SEED EVENTI
 *
 * Elimina eventi, ordini e iscritti creati da seed-events.ts
 * (riconoscibili dall'ID che contiene "-seed-")
 *
 * Esegui con:
 *   npm run seed:events:clean
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

const IS_EMULATOR = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";
if (!IS_EMULATOR) {
  console.error("❌ ABORT: NEXT_PUBLIC_USE_EMULATORS !== 'true'. Unseed consentito solo su emulatori.");
  process.exit(1);
}
process.env.FIRESTORE_EMULATOR_HOST ??= "localhost:8080";
console.log("📡 Modalità emulatore: Firestore su localhost:8080\n");

getAdminApp();
const db = getFirestore();

const SEED_MARKER = "-seed-";

async function deleteSeededDocs(collection: string) {
  const snap = await db.collection(collection).get();
  const toDelete = snap.docs.filter((d) => d.id.includes(SEED_MARKER));
  if (toDelete.length === 0) return 0;

  const batch = db.batch();
  for (const doc of toDelete) {
    batch.delete(doc.ref);
  }
  await batch.commit();
  return toDelete.length;
}

async function deleteSeededOrdersWithSubcollections() {
  const snap = await db.collection("eventOrders").get();
  const toDelete = snap.docs.filter((d) => d.id.includes(SEED_MARKER));
  let count = 0;

  for (const doc of toDelete) {
    // Cancella subcollection transactions
    const txSnap = await doc.ref.collection("transactions").get();
    const batch = db.batch();
    txSnap.docs.forEach((tx) => batch.delete(tx.ref));
    batch.delete(doc.ref);
    await batch.commit();
    count++;
  }
  return count;
}

async function main() {
  console.log("🗑️  Rimozione seed eventi...\n");

  const evCount  = await deleteSeededDocs("events");
  const ordCount = await deleteSeededOrdersWithSubcollections();
  const subCount = await deleteSeededDocs("eventSubscribers");

  console.log(`  ✓ ${evCount} eventi rimossi`);
  console.log(`  ✓ ${ordCount} ordini rimossi`);
  console.log(`  ✓ ${subCount} iscritti rimossi`);
  console.log("\n✅ Unseed eventi completato!");
}

main().catch((err) => {
  console.error("❌ Errore:", err);
  process.exit(1);
});
