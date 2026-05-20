"use server";

import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";

import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import { ReportFormSchema } from "@/schemas/report";
import type { ReportDoc } from "@/schemas/report";
import { tsToISO } from "@/lib/utils/date";
import type { ActionResult, PaginatedResult } from "@/types";
import { getClient } from "./clients";
import { getSample } from "./samples";
import { getCompanySettings } from "./settings";
import { getClientPackages } from "./clientPackages";
import { ReportPdfDocument } from "@/components/pdf/ReportPdfDocument";
import type { SampleDoc } from "@/schemas/sample";

const COL = "reports";
const PAGE_SIZE = 25;

// ── Converti Firestore doc ────────────────────────────────────────────
function toReportDoc(id: string, data: FirebaseFirestore.DocumentData): ReportDoc {
  return {
    id,
    number: data["number"] ?? "",
    clientId: data["clientId"] ?? "",
    clientSnapshot: data["clientSnapshot"] ?? {},
    sampleIds: data["sampleIds"] ?? [],
    generatedAt: tsToISO(data["generatedAt"]),
    pdfStorageRef: data["pdfStorageRef"] ?? "",
    notes: data["notes"],
    createdAt: tsToISO(data["createdAt"]),
    updatedAt: tsToISO(data["updatedAt"]),
  };
}

// ── Genera numero referto R-YYYY-NNNN ────────────────────────────────
async function getNextReportNumber(
  tx: FirebaseFirestore.Transaction,
  year: number,
): Promise<string> {
  const counterRef = adminDb.doc(`counters/reports_${year}`);
  const snap = await tx.get(counterRef);
  const next = (snap.data()?.["seq"] ?? 0) + 1;
  tx.set(counterRef, { seq: next }, { merge: true });
  return `R-${year}-${String(next).padStart(4, "0")}`;
}

// ── Lista referti ─────────────────────────────────────────────────────
export async function getReports(
  opts: { clientId?: string; cursor?: string } = {},
): Promise<PaginatedResult<ReportDoc>> {
  await requireAdmin();

  let query = adminDb.collection(COL).orderBy("createdAt", "desc");
  if (opts.clientId) {
    query = query.where("clientId", "==", opts.clientId) as typeof query;
  }
  if (opts.cursor) {
    const cursorDoc = await adminDb.collection(COL).doc(opts.cursor).get();
    if (cursorDoc.exists) query = query.startAfter(cursorDoc) as typeof query;
  }

  const snap = await query.limit(PAGE_SIZE + 1).get();
  const docs = snap.docs.map((d) => toReportDoc(d.id, d.data()));
  const hasMore = docs.length > PAGE_SIZE;
  return {
    items: hasMore ? docs.slice(0, PAGE_SIZE) : docs,
    nextCursor: hasMore ? (docs[PAGE_SIZE - 1]?.id ?? null) : null,
    hasMore,
  };
}

// ── Singolo referto ───────────────────────────────────────────────────
export async function getReport(id: string): Promise<ReportDoc | null> {
  await requireAdmin();
  const snap = await adminDb.collection(COL).doc(id).get();
  if (!snap.exists) return null;
  return toReportDoc(snap.id, snap.data()!);
}

// ── Crea referto + genera PDF + salva su Storage ──────────────────────
export async function createReport(
  raw: unknown,
): Promise<ActionResult<{ id: string; number: string }>> {
  const actor = await requireAdmin();

  const parsed = ReportFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path]!.push(issue.message);
    }
    return { success: false, error: "Dati non validi", fieldErrors };
  }

  const data = parsed.data;

  // Carica cliente e campioni
  const [client, company, ...sampleResults] = await Promise.all([
    getClient(data.clientId),
    getCompanySettings(),
    ...data.sampleIds.map((id) => getSample(id)),
  ]);

  if (!client) return { success: false, error: "Cliente non trovato" };

  const samples = sampleResults.filter((s): s is SampleDoc => s !== null);
  if (samples.length === 0) return { success: false, error: "Nessun campione valido" };

  const allPackages = await getClientPackages(data.clientId);
  const activePackages = allPackages.filter((p) => p.status === "active");

  const year = new Date().getFullYear();

  try {
    let createdId = "";
    let reportNumber = "";

    await adminDb.runTransaction(async (tx) => {
      const reportNumber_ = await getNextReportNumber(tx, year);
      reportNumber = reportNumber_;

      const reportRef = adminDb.collection(COL).doc();
      createdId = reportRef.id;

      const clientSnapshot = {
        displayName: client.displayName,
        email: client.email ?? null,
        vatNumber: "vatNumber" in client ? (client.vatNumber ?? null) : null,
        taxCode: client.taxCode ?? null,
        address: client.address ?? null,
      };

      tx.set(reportRef, {
        number: reportNumber_,
        clientId: data.clientId,
        clientSnapshot,
        sampleIds: data.sampleIds,
        notes: data.notes ?? null,
        pdfStorageRef: "",        // aggiornato dopo la generazione PDF
        generatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: actor.uid,
      });
    });

    // Genera PDF fuori dalla transazione (I/O pesante)
    const element = React.createElement(ReportPdfDocument, {
      reportNumber,
      company,
      client,
      samples,
      notes: data.notes,
      clientPackages: activePackages,
    });
    const buffer = await renderToBuffer(element as React.ReactElement<DocumentProps>);

    // Salva su Firebase Storage (non bloccante — il bucket potrebbe non essere abilitato)
    const storagePath = `reports/${createdId}.pdf`;
    try {
      const bucket = adminStorage.bucket();
      const file = bucket.file(storagePath);
      await file.save(buffer, {
        contentType: "application/pdf",
        metadata: { cacheControl: "private, max-age=31536000" },
      });
      // Aggiorna il documento con il ref Storage
      await adminDb.collection(COL).doc(createdId).update({
        pdfStorageRef: storagePath,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (storageErr) {
      logger.warn("Upload PDF su Storage fallito (non bloccante)", { storageErr });
    }

    revalidatePath("/reports");
    return { success: true, data: { id: createdId, number: reportNumber } };
  } catch (err) {
    logger.error("createReport failed", { err });
    return { success: false, error: "Errore durante la generazione del referto" };
  }
}

// ── Genera URL download firmato (1h) ──────────────────────────────────
export async function getReportDownloadUrl(storagePath: string): Promise<string> {
  await requireAdmin();
  const bucket = adminStorage.bucket();
  const file = bucket.file(storagePath);
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 60 * 60 * 1000, // 1h
  });
  return url;
}

// ── Invia referto via email (Resend) ──────────────────────────────────
export async function sendReportByEmail(
  reportId: string,
  opts: { to: string; subject?: string; body?: string; type?: "technical" | "commercial" },
): Promise<ActionResult<void>> {
  await requireAdmin();

  try {
    const report = await getReport(reportId);
    if (!report) return { success: false, error: "Referto non trovato" };

    const isCommercial = opts.type === "commercial";
    let pdfBuffer: Buffer;

    if (!isCommercial && report.pdfStorageRef) {
      // Tecnico pre-generato su Storage
      const bucket = adminStorage.bucket();
      const [downloaded] = await bucket.file(report.pdfStorageRef).download();
      pdfBuffer = downloaded;
    } else {
      // Genera al volo (commerciale sempre, tecnico se non su Storage)
      const { getClient } = await import("./clients");
      const { getSample } = await import("./samples");
      const { getCompanySettings } = await import("./settings");
      const { renderToBuffer } = await import("@react-pdf/renderer");
      const React = await import("react");

      const [client, company, ...sampleResults] = await Promise.all([
        getClient(report.clientId),
        getCompanySettings(),
        ...report.sampleIds.map((sid) => getSample(sid)),
      ]);

      if (!client) return { success: false, error: "Cliente non trovato" };
      const samples = sampleResults.filter((s) => s !== null);
      const { getClientPackages } = await import("./clientPackages");
      const allPkgs = await getClientPackages(report.clientId);
      const activePackages = allPkgs.filter((p) => p.status === "active");
      const props = { reportNumber: report.number, company, client, samples, notes: report.notes, clientPackages: activePackages };

      const element = isCommercial
        ? React.createElement((await import("@/components/pdf/ReportCommercialPdfDocument")).ReportCommercialPdfDocument, props)
        : React.createElement((await import("@/components/pdf/ReportPdfDocument")).ReportPdfDocument, props);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pdfBuffer = await renderToBuffer(element as any);
    }

    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@vinifera.app";
    const subject = opts.subject ?? `Referto ${report.number} — ${report.clientSnapshot.displayName}`;
    const bodyText = opts.body ?? `In allegato il referto ${report.number}.\n\nGrazie per aver scelto il nostro laboratorio.`;
    const filename = isCommercial
      ? `referto-commerciale-${report.number}.pdf`
      : `referto-${report.number}.pdf`;

    await resend.emails.send({
      from: fromEmail,
      to: opts.to,
      subject,
      text: bodyText,
      attachments: [{ filename, content: pdfBuffer }],
    });

    revalidatePath(`/reports/${reportId}`);
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("sendReportByEmail failed", { err });
    return { success: false, error: "Errore durante l'invio email" };
  }
}
