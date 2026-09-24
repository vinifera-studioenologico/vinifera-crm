#!/usr/bin/env tsx
/**
 * Imposta deletedAt: null nei campioni esistenti che ne sono privi.
 * Necessario perché getSamples() ora filtra where("deletedAt", "==", null):
 * senza backfill, i campioni creati prima di questa migrazione sparirebbero
 * dalle liste (il filtro di uguaglianza non fa match su un campo assente).
 * Uso: npx tsx scripts/migrate-sample-deleted-at.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0]!;
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    }),
  });
}

const app = getAdminApp();
const db = getFirestore(app);

async function main() {
  const snap = await db.collection("samples").get();

  let fixed = 0;
  let skipped = 0;

  const batch = db.batch();

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.deletedAt === undefined) {
      batch.update(doc.ref, { deletedAt: null });
      fixed++;
    } else {
      skipped++;
    }
  }

  if (fixed === 0) {
    console.log("Nessun documento da migrare.");
    return;
  }

  await batch.commit();
  console.log(`\n✅ Migrazione completata: ${fixed} aggiornati, ${skipped} già a posto.`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("❌ Errore:", err);
  process.exit(1);
});
