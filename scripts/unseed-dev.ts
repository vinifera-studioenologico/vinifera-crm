/**
 * RIMOZIONE SEED DI TEST
 *
 * Elimina tutti i documenti creati da seed-dev.ts
 * (riconoscibili dall'ID che contiene "-seed-")
 *
 * Esegui con:
 *   npm run seed:clean
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

getAdminApp();
const db = getFirestore();

const SEED_MARKER = "-seed-";

// Collezioni di primo livello da ripulire
const TOP_LEVEL_COLLECTIONS = [
  "analyses",
  "packages",
  "clients",
  "clientPackages",
  "quotes",
  "samples",
  "reminders",
];

// Collezioni con sottocollezioni
const NESTED_COLLECTIONS: Array<{ parent: string; sub: string }> = [
  { parent: "payments", sub: "installments" },
];

async function deleteSeededDocs(collection: string) {
  const snap = await db.collection(collection).get();
  const toDelete = snap.docs.filter((d) => d.id.includes(SEED_MARKER));

  if (toDelete.length === 0) {
    console.log(`  ${collection}: nessun seed trovato`);
    return 0;
  }

  // Batch delete (max 500 per batch)
  let count = 0;
  for (let i = 0; i < toDelete.length; i += 500) {
    const batch = db.batch();
    toDelete.slice(i, i + 500).forEach((d) => batch.delete(d.ref));
    await batch.commit();
    count += toDelete.slice(i, i + 500).length;
  }

  console.log(`  ${collection}: eliminati ${count} documenti`);
  return count;
}

async function deleteSeededNested(parent: string, sub: string) {
  const parentSnap = await db.collection(parent).get();
  const seededParents = parentSnap.docs.filter((d) => d.id.includes(SEED_MARKER));

  let count = 0;
  for (const parentDoc of seededParents) {
    const subSnap = await parentDoc.ref.collection(sub).get();
    const subToDelete = subSnap.docs.filter((d) => d.id.includes(SEED_MARKER));
    if (subToDelete.length > 0) {
      const batch = db.batch();
      subToDelete.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      count += subToDelete.length;
    }
  }

  if (count > 0) console.log(`  ${parent}/${sub}: eliminati ${count} documenti`);
  return count;
}

async function unseed() {
  console.log("🗑  Rimozione seed in corso...\n");

  let total = 0;

  for (const col of TOP_LEVEL_COLLECTIONS) {
    total += await deleteSeededDocs(col);
  }

  for (const { parent, sub } of NESTED_COLLECTIONS) {
    total += await deleteSeededNested(parent, sub);
    total += await deleteSeededDocs(parent); // poi il parent stesso
  }

  // Settings company (documento fisso, lo elimina solo se fu creato dal seed)
  // Lo saltiamo — è condiviso con dati reali potenziali
  // Se vuoi rimuoverlo: db.collection("settings").doc("company").delete()

  // Contatori progressivi inizializzati dal seed
  const counterDocs = ["quotes_2026", "samples_2025", "samples_2026"];
  const batchCounters = db.batch();
  for (const docId of counterDocs) {
    batchCounters.delete(db.collection("counters").doc(docId));
  }
  await batchCounters.commit();
  console.log(`  counters: eliminati ${counterDocs.length} documenti`);

  console.log(`\n✅ Rimossi ${total} documenti seed.`);
}

unseed().catch((err) => {
  console.error("❌ Unseed fallito:", err);
  process.exit(1);
});
