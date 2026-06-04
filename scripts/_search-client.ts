#!/usr/bin/env tsx
/**
 * Cerca un cliente per nome/cognome nel DB Firestore.
 * Uso: npx tsx scripts/_search-client.ts "Antonini"
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

async function main() {
  const searchTerm = process.argv[2] ?? "Antonini";
  const app = getAdminApp();
  const db = getFirestore(app);

  console.log(`\nCercando "${searchTerm}" nella collezione clients...\n`);

  // Get ALL clients (including soft-deleted ones)
  const snap = await db.collection("clients").get();
  console.log(`Totale documenti in clients: ${snap.size}\n`);

  const matches = snap.docs.filter((doc) => {
    const data = doc.data();
    const fields = [
      data.name,
      data.lastName,
      data.companyName,
      data.slug,
      data.email,
      data.searchIndex,
    ];
    return fields.some(
      (f) =>
        typeof f === "string" &&
        f.toLowerCase().includes(searchTerm.toLowerCase()),
    ) || (Array.isArray(data.searchIndex) && data.searchIndex.some(
      (s: string) => s.toLowerCase().includes(searchTerm.toLowerCase()),
    ));
  });

  if (matches.length === 0) {
    console.log(`Nessun documento trovato contenente "${searchTerm}".`);
    console.log("\nControllo anche le altre collezioni per riferimenti...\n");

    // Search in quotes, samples, payments, reminders for references to this name
    for (const col of ["quotes", "samples", "payments", "reminders", "reports"]) {
      const colSnap = await db.collection(col).get();
      const refs = colSnap.docs.filter((doc) => {
        const raw = JSON.stringify(doc.data());
        return raw.toLowerCase().includes(searchTerm.toLowerCase());
      });
      if (refs.length > 0) {
        console.log(`  ${col}: ${refs.length} riferimenti trovati:`);
        for (const r of refs) {
          const d = r.data();
          console.log(`    - ${r.id} | clientId: ${d.clientId ?? "N/A"} | ${d.clientName ?? d.name ?? ""}`);
        }
      }
    }
  } else {
    console.log(`Trovati ${matches.length} documento/i:\n`);
    for (const doc of matches) {
      const d = doc.data();
      console.log(`ID: ${doc.id}`);
      console.log(`  Nome: ${d.name ?? ""} ${d.lastName ?? ""}`);
      console.log(`  Azienda: ${d.companyName ?? "N/A"}`);
      console.log(`  Email: ${d.email ?? "N/A"}`);
      console.log(`  deletedAt: ${d.deletedAt ? JSON.stringify(d.deletedAt) : "NULL (attivo)"}`);
      console.log(`  createdAt: ${d.createdAt ? JSON.stringify(d.createdAt) : "N/A"}`);
      console.log(`  updatedAt: ${d.updatedAt ? JSON.stringify(d.updatedAt) : "N/A"}`);
      console.log(`  slug: ${d.slug ?? "N/A"}`);
      console.log(`  Dati completi:`, JSON.stringify(d, null, 2));
      console.log();
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Errore:", err);
  process.exit(1);
});
