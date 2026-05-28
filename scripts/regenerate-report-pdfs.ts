/**
 * Rigenera i PDF di tutti i referti esistenti con il layout aggiornato
 * e li ricarica su Firebase Storage, sovrascrivendo i vecchi.
 *
 * Esegui con:
 *   npx tsx scripts/regenerate-report-pdfs.ts
 *
 * Opzionale: passa l'ID del referto per rigenerare solo quello
 *   npx tsx scripts/regenerate-report-pdfs.ts <reportId>
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";

// tsx v4 risolve automaticamente i path alias da tsconfig.json
import { ReportPdfDocument } from "@/components/pdf/ReportPdfDocument";
import type { CompanySettingsValues } from "@/schemas/client";
import type { ClientDoc } from "@/schemas/client";
import type { SampleDoc } from "@/schemas/sample";
import type { ClientPackageDoc } from "@/schemas/package";

// ── Firebase Admin ────────────────────────────────────────────────────
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

const app = getAdminApp();
const db = getFirestore(app);
const storage = getStorage(app);

// ── Fetch helpers ─────────────────────────────────────────────────────
async function fetchCompany(): Promise<CompanySettingsValues | null> {
  const snap = await db.doc("settings/company").get();
  if (!snap.exists) return null;
  return snap.data() as CompanySettingsValues;
}

async function fetchClient(clientId: string): Promise<ClientDoc | null> {
  const snap = await db.collection("clients").doc(clientId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as ClientDoc;
}

async function fetchSamples(sampleIds: string[]): Promise<SampleDoc[]> {
  if (sampleIds.length === 0) return [];
  // Firestore "in" query supports max 30 items
  const chunks: string[][] = [];
  for (let i = 0; i < sampleIds.length; i += 30) {
    chunks.push(sampleIds.slice(i, i + 30));
  }
  const results: SampleDoc[] = [];
  for (const chunk of chunks) {
    const snap = await db.collection("samples").where("__name__", "in", chunk).get();
    snap.docs.forEach((d) => results.push({ id: d.id, ...d.data() } as SampleDoc));
  }
  // Riordina per mantenere l'ordine originale di sampleIds
  const byId = new Map(results.map((s) => [s.id, s]));
  return sampleIds.map((id) => byId.get(id)).filter((s): s is SampleDoc => !!s);
}

async function fetchActivePackages(clientId: string): Promise<ClientPackageDoc[]> {
  const snap = await db
    .collection("clientPackages")
    .where("clientId", "==", clientId)
    .where("status", "==", "active")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClientPackageDoc));
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const targetId = process.argv[2];

  const company = await fetchCompany();
  console.log(`Company: ${company?.displayName ?? "(non trovata)"}`);

  // Carica referti
  const query: FirebaseFirestore.Query = db.collection("reports").orderBy("createdAt", "asc");
  if (targetId) {
    // Modalità singolo referto
    const single = await db.collection("reports").doc(targetId).get();
    if (!single.exists) {
      console.error(`Referto ${targetId} non trovato.`);
      process.exit(1);
    }
    const data = single.data()!;
    const reports = [{ id: single.id, ...data }];
    await processReports(reports, company);
    return;
  }

  const snap = await query.get();
  console.log(`Referti trovati: ${snap.docs.length}`);

  const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  await processReports(reports, company);
}

async function processReports(
  reports: Array<Record<string, unknown> & { id: string }>,
  company: CompanySettingsValues | null,
) {
  let ok = 0;
  let errors = 0;

  for (const report of reports) {
    const number = report["number"] as string;
    const clientId = report["clientId"] as string;
    const sampleIds = (report["sampleIds"] as string[]) ?? [];
    const notes = report["notes"] as string | undefined;

    process.stdout.write(`  ${number} ... `);

    try {
      const [client, samples] = await Promise.all([
        fetchClient(clientId),
        fetchSamples(sampleIds),
      ]);

      if (!client) {
        console.log("SKIP (cliente non trovato)");
        errors++;
        continue;
      }
      if (samples.length === 0) {
        console.log("SKIP (nessun campione)");
        errors++;
        continue;
      }

      const activePackages = await fetchActivePackages(clientId);

      const element = React.createElement(ReportPdfDocument, {
        reportNumber: number,
        company,
        client,
        samples,
        notes,
        clientPackages: activePackages,
      });

      const buffer = await renderToBuffer(element as React.ReactElement<DocumentProps>);

      const storagePath = `reports/${report.id}.pdf`;
      const bucket = storage.bucket();
      const file = bucket.file(storagePath);
      await file.save(buffer, {
        contentType: "application/pdf",
        metadata: { cacheControl: "private, max-age=31536000" },
      });

      // Aggiorna pdfStorageRef se era vuoto
      if (!report["pdfStorageRef"]) {
        await db.collection("reports").doc(report.id).update({ pdfStorageRef: storagePath });
      }

      console.log("OK");
      ok++;
    } catch (err) {
      console.log(`ERRORE: ${(err as Error).message}`);
      errors++;
    }
  }

  console.log(`\nCompletato: ${ok} rigenerati, ${errors} errori.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
