/**
 * Elimina i referti di test e riporta il contatore a 359
 * (prossimo referto = R-2026-0360)
 *
 * Esegui con:
 *   npx tsx scripts/delete-test-reports.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const NUMBERS_TO_DELETE = ["R-2026-0360", "R-2026-0361", "R-2026-0362"];
const COUNTER_YEAR = 2026;
const COUNTER_VALUE = 359; // prossimo sarà R-2026-0360

function getAdminApp() {
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

async function main() {
  const app = getAdminApp();
  const db = getFirestore(app);
  const storage = getStorage(app);

  // 1. Trova i documenti con i numeri specificati
  const snap = await db
    .collection("reports")
    .where("number", "in", NUMBERS_TO_DELETE)
    .get();

  if (snap.empty) {
    console.log("Nessun referto trovato con i numeri:", NUMBERS_TO_DELETE);
  } else {
    console.log(`Trovati ${snap.docs.length} referti da eliminare:`);

    for (const doc of snap.docs) {
      const data = doc.data();
      console.log(`  - ${data["number"]} | ${data["clientSnapshot"]?.displayName} | id=${doc.id}`);

      // 1a. Elimina PDF da Storage (se presente)
      const pdfRef: string | undefined = data["pdfStorageRef"];
      if (pdfRef) {
        try {
          await storage.bucket().file(pdfRef).delete();
          console.log(`    PDF rimosso da Storage: ${pdfRef}`);
        } catch {
          console.log(`    PDF non trovato su Storage (già assente): ${pdfRef}`);
        }
      }

      // 1b. Elimina documento Firestore
      await db.collection("reports").doc(doc.id).delete();
      console.log(`    Documento Firestore eliminato.`);
    }
  }

  // 2. Reimposta il contatore
  const counterRef = db.doc(`counters/reports_${COUNTER_YEAR}`);
  const before = await counterRef.get();
  const seqBefore = before.data()?.["seq"] ?? "(non esiste)";
  await counterRef.set({ seq: COUNTER_VALUE }, { merge: true });

  console.log(`\nContatore reports_${COUNTER_YEAR}:`);
  console.log(`  seq prima:  ${seqBefore}`);
  console.log(`  seq dopo:   ${COUNTER_VALUE}`);
  console.log(`  prossimo referto: R-${COUNTER_YEAR}-${String(COUNTER_VALUE + 1).padStart(4, "0")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
