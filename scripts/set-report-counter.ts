/**
 * Imposta il contatore referti globale.
 *
 * Esegui con:
 *   npx tsx scripts/set-report-counter.ts [valore]
 *
 * Esempio — fa sì che il prossimo referto sia R-0357:
 *   npx tsx scripts/set-report-counter.ts 356
 *
 * Richiede Firebase Admin configurato (.env.local con FIREBASE_ADMIN_* compilati).
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0]!;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n",
  );
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

async function main() {
  const seq = parseInt(process.argv[2] ?? "0", 10);

  if (isNaN(seq) || seq < 0) {
    console.error("Uso: npx tsx scripts/set-report-counter.ts [valore]");
    process.exit(1);
  }

  const app = getAdminApp();
  const db = getFirestore(app);

  const ref = db.doc("counters/reports");

  const before = await ref.get();
  const seqBefore = before.data()?.["seq"] ?? "(documento non esiste)";

  await ref.set({ seq }, { merge: true });

  console.log("counters/reports:");
  console.log(`  seq prima:  ${seqBefore}`);
  console.log(`  seq dopo:   ${seq}`);
  console.log(`  prossimo referto: R-${String(seq + 1).padStart(4, "0")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
