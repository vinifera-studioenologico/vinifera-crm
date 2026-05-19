#!/usr/bin/env tsx
/**
 * PULIZIA COMPLETA DEL DATABASE
 *
 * Elimina TUTTI i documenti da tutte le collezioni Firestore.
 * Le impostazioni aziendali (settings/company) vengono mantenute per default.
 *
 * Uso:
 *   npx tsx scripts/clear-all.ts            # mantiene settings
 *   npx tsx scripts/clear-all.ts --all      # cancella anche settings e counters
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as readline from "readline";

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

getAdminApp();
const db = getFirestore();

const includeSettings = process.argv.includes("--all");

// Collezioni top-level da svuotare completamente
const DATA_COLLECTIONS = [
  "analyses",
  "packages",
  "clients",
  "clientPackages",
  "quotes",
  "samples",
  "payments",   // ha subcollection "installments" — Firestore le elimina automaticamente con il parent solo tramite Admin SDK bulk delete
  "reminders",
  "reports",
];

const SETTINGS_COLLECTIONS = ["settings", "counters"];

async function deleteCollection(name: string) {
  let deleted = 0;
  let snap = await db.collection(name).limit(500).get();

  while (!snap.empty) {
    const batch = db.batch();

    // Per payments, elimina prima le subcollection installments
    if (name === "payments") {
      for (const doc of snap.docs) {
        const subSnap = await doc.ref.collection("installments").get();
        if (!subSnap.empty) {
          const subBatch = db.batch();
          subSnap.docs.forEach((d) => subBatch.delete(d.ref));
          await subBatch.commit();
        }
      }
    }

    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.docs.length;
    snap = await db.collection(name).limit(500).get();
  }

  if (deleted > 0) console.log(`  ✓ ${name}: ${deleted} documenti eliminati`);
  else console.log(`  — ${name}: vuota`);
}

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "s");
    });
  });
}

async function main() {
  const targets = includeSettings
    ? [...DATA_COLLECTIONS, ...SETTINGS_COLLECTIONS]
    : DATA_COLLECTIONS;

  console.log("\n⚠️  ATTENZIONE: questa operazione è IRREVERSIBILE.\n");
  console.log("Verranno svuotate le seguenti collezioni:");
  targets.forEach((c) => console.log(`  • ${c}`));
  if (!includeSettings) {
    console.log("\n  (settings e counters mantenuti — usa --all per includerli)");
  }

  const ok = await confirm("\nProcedere? (s/N): ");
  if (!ok) {
    console.log("Annullato.");
    process.exit(0);
  }

  console.log("\nEliminazione in corso...");
  for (const col of targets) {
    await deleteCollection(col);
  }

  console.log("\n✅ Database pulito.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Errore:", err);
  process.exit(1);
});
