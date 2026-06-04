#!/usr/bin/env tsx
/**
 * Migra pdfFooterNote -> quoteFooterNote + reportFooterNote
 * Uso: npx tsx scripts/migrate-footer-notes.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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
  const doc = await db.doc("settings/company").get();
  const data = doc.data();

  if (!data) {
    console.log("Nessun documento settings/company trovato.");
    return;
  }

  const old = data.pdfFooterNote;
  if (!old) {
    console.log("pdfFooterNote non presente, nulla da migrare.");
    return;
  }

  console.log(`Vecchio pdfFooterNote: "${old}"`);
  console.log("Copio in quoteFooterNote e reportFooterNote, rimuovo pdfFooterNote...");

  await db.doc("settings/company").update({
    quoteFooterNote: data.quoteFooterNote || old,
    reportFooterNote: data.reportFooterNote || old,
    pdfFooterNote: FieldValue.delete(),
  });

  console.log("✅ Migrazione completata!");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("❌ Errore:", err);
  process.exit(1);
});
