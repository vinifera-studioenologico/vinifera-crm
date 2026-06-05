/**
 * Migra i numeri referto da R-YYYY-NNNN a R-NNNN (ordine cronologico).
 * Imposta anche il contatore globale `counters/reports` al valore più alto.
 *
 * Esegui con:
 *   npx tsx scripts/migrate-report-numbers.ts
 *
 * Aggiunge --dry-run per simulare senza scrivere:
 *   npx tsx scripts/migrate-report-numbers.ts --dry-run
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

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("=== DRY RUN — nessuna modifica verrà scritta ===\n");

  const app = getAdminApp();
  const db = getFirestore(app);

  // 1. Carica tutti i referti ordinati per data di creazione
  const snap = await db.collection("reports").orderBy("createdAt", "asc").get();
  console.log(`Trovati ${snap.docs.length} referti.\n`);

  if (snap.empty) {
    console.log("Nessun referto da migrare.");
    return;
  }

  // 2. Rinomina togliendo l'anno, mantenendo il numero originale
  let maxSeq = 0;
  const batch = db.batch();

  for (const doc of snap.docs) {
    const oldNumber: string = doc.data()["number"] ?? "";
    // Estrae la parte numerica finale da R-YYYY-NNNN o R-NNNN
    const match = oldNumber.match(/R-(?:\d{4}-)?(\d+)$/);
    if (!match) {
      console.log(`  ${oldNumber} → SKIP (formato non riconosciuto)`);
      continue;
    }

    const seqNum = parseInt(match[1]!, 10);
    if (seqNum > maxSeq) maxSeq = seqNum;

    const newNumber = `R-${match[1]}`;

    if (oldNumber === newNumber) {
      console.log(`  ${oldNumber} → ${newNumber} (invariato)`);
      continue;
    }

    console.log(`  ${oldNumber} → ${newNumber}`);
    if (!dryRun) {
      batch.update(doc.ref, { number: newNumber });
    }
  }

  // 3. Aggiorna il contatore globale al valore più alto trovato
  const seq = maxSeq;
  console.log(`\nContatore globale → ${seq} (prossimo: R-${String(seq + 1).padStart(4, "0")})`);

  if (!dryRun) {
    batch.set(db.doc("counters/reports"), { seq }, { merge: true });
    await batch.commit();
    console.log("\nMigrazione completata.");
    console.log("Esegui ora: npx tsx scripts/regenerate-report-pdfs.ts");
  } else {
    console.log("\nDry run completato — nessuna modifica scritta.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
