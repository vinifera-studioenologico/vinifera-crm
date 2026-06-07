/**
 * Imposta il contatore campioni per un anno specifico.
 *
 * Esegui con:
 *   npx tsx scripts/set-sample-counter.ts [anno] [valore]
 *
 * Esempio — fa sì che il prossimo campione sia C-2026-0192:
 *   npx tsx scripts/set-sample-counter.ts 2026 191
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
  const year = parseInt(process.argv[2] ?? String(new Date().getFullYear()), 10);
  const seq = parseInt(process.argv[3] ?? "0", 10);

  if (isNaN(year) || isNaN(seq) || seq < 0) {
    console.error("Uso: npx tsx scripts/set-sample-counter.ts [anno] [valore]");
    process.exit(1);
  }

  const app = getAdminApp();
  const db = getFirestore(app);

  const docId = `samples_${year}`;
  const ref = db.doc(`counters/${docId}`);

  const before = await ref.get();
  const seqBefore = before.data()?.["seq"] ?? "(documento non esiste)";

  await ref.set({ seq }, { merge: true });

  console.log(`counters/${docId}:`);
  console.log(`  seq prima:  ${seqBefore}`);
  console.log(`  seq dopo:   ${seq}`);
  console.log(`  prossimo campione: C-${year}-${String(seq + 1).padStart(4, "0")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
