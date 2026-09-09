"use server";

import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";

import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import { ReportSummaryFormSchema } from "@/schemas/reportSummary";
import type { ReportSummaryDoc } from "@/schemas/reportSummary";
import type { ReportDoc } from "@/schemas/report";
import type { SampleDoc } from "@/schemas/sample";
import { tsToISO } from "@/lib/utils/date";
import type { ActionResult, PaginatedResult } from "@/types";
import { getClient } from "./clients";
import { getReport } from "./reports";
import { getSample } from "./samples";
import { getCompanySettings } from "./settings";
import { ReportSummaryPdfDocument, type ReportSummaryGroup } from "@/components/pdf/ReportSummaryPdfDocument";

const COL = "reportSummaries";
const PAGE_SIZE = 25;

// ── Converti Firestore doc ────────────────────────────────────────────
function toReportSummaryDoc(id: string, data: FirebaseFirestore.DocumentData): ReportSummaryDoc {
  return {
    id,
    number: data["number"] ?? "",
    clientId: data["clientId"] ?? "",
    clientSnapshot: data["clientSnapshot"] ?? {},
    reportIds: data["reportIds"] ?? [],
    totalCents: data["totalCents"] ?? 0,
    generatedAt: tsToISO(data["generatedAt"]),
    pdfStorageRef: data["pdfStorageRef"] ?? "",
    notes: data["notes"],
    createdAt: tsToISO(data["createdAt"]),
    updatedAt: tsToISO(data["updatedAt"]),
  };
}

// ── Genera numero referto riepilogativo RS-NNNN ────────────────────────
async function getNextReportSummaryNumber(
  tx: FirebaseFirestore.Transaction,
): Promise<string> {
  const counterRef = adminDb.doc("counters/reportSummaries");
  const snap = await tx.get(counterRef);
  const next = (snap.data()?.["seq"] ?? 0) + 1;
  tx.set(counterRef, { seq: next }, { merge: true });
  return `RS-${String(next).padStart(4, "0")}`;
}

// ── Risolve i referti selezionati + relativi campioni ──────────────────
// (stessa "matrioska" del referto singolo: referto → campioni → analisi;
// qui aggiungiamo un livello sopra — riepilogo → referti → campioni)
async function resolveGroups(reportIds: string[]): Promise<ReportSummaryGroup[]> {
  const reports = (await Promise.all(reportIds.map((id) => getReport(id))))
    .filter((r): r is ReportDoc => r !== null);

  const allSampleIds = Array.from(new Set(reports.flatMap((r) => r.sampleIds)));
  const sampleResults = await Promise.all(allSampleIds.map((id) => getSample(id)));
  const samplesById = new Map<string, SampleDoc>();
  for (const s of sampleResults) if (s) samplesById.set(s.id, s);

  return reports.map((report) => ({
    report,
    samples: report.sampleIds
      .map((id) => samplesById.get(id))
      .filter((s): s is SampleDoc => s !== undefined),
  }));
}

function computeTotalCents(groups: ReportSummaryGroup[]): number {
  return groups.reduce(
    (acc, g) =>
      acc +
      g.samples.reduce(
        (a, s) =>
          a +
          s.items.reduce(
            (b, item) => b + (item.coveredByPackageId && !item.chargeAnyway ? 0 : item.unitPriceCents),
            0,
          ),
        0,
      ),
    0,
  );
}

// ── Lista referti riepilogativi ────────────────────────────────────────
export async function getReportSummaries(
  opts: { clientId?: string; cursor?: string } = {},
): Promise<PaginatedResult<ReportSummaryDoc>> {
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
  const docs = snap.docs.map((d) => toReportSummaryDoc(d.id, d.data()));
  const hasMore = docs.length > PAGE_SIZE;
  return {
    items: hasMore ? docs.slice(0, PAGE_SIZE) : docs,
    nextCursor: hasMore ? (docs[PAGE_SIZE - 1]?.id ?? null) : null,
    hasMore,
  };
}

// ── Singolo referto riepilogativo ──────────────────────────────────────
export async function getReportSummary(id: string): Promise<ReportSummaryDoc | null> {
  await requireAdmin();
  const snap = await adminDb.collection(COL).doc(id).get();
  if (!snap.exists) return null;
  return toReportSummaryDoc(snap.id, snap.data()!);
}

// ── Crea referto riepilogativo + genera PDF + salva su Storage ─────────
export async function createReportSummary(
  raw: unknown,
): Promise<ActionResult<{ id: string; number: string }>> {
  const actor = await requireAdmin();

  const parsed = ReportSummaryFormSchema.safeParse(raw);
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

  const [client, company] = await Promise.all([
    getClient(data.clientId),
    getCompanySettings(),
  ]);
  if (!client) return { success: false, error: "Cliente non trovato" };

  const groups = await resolveGroups(data.reportIds);
  if (groups.length === 0) return { success: false, error: "Nessun referto valido selezionato" };
  if (groups.some((g) => g.report.clientId !== data.clientId)) {
    return { success: false, error: "Tutti i referti devono appartenere allo stesso cliente" };
  }

  const totalCents = computeTotalCents(groups);

  try {
    let createdId = "";
    let summaryNumber = "";

    await adminDb.runTransaction(async (tx) => {
      summaryNumber = await getNextReportSummaryNumber(tx);

      const ref = adminDb.collection(COL).doc();
      createdId = ref.id;

      const clientSnapshot = {
        displayName: client.displayName,
        email: client.email ?? null,
        vatNumber: "vatNumber" in client ? (client.vatNumber ?? null) : null,
        taxCode: client.taxCode ?? null,
        address: client.address ?? null,
      };

      tx.set(ref, {
        number: summaryNumber,
        clientId: data.clientId,
        clientSnapshot,
        reportIds: data.reportIds,
        totalCents,
        notes: data.notes ?? null,
        pdfStorageRef: "",
        generatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: actor.uid,
      });
    });

    const element = React.createElement(ReportSummaryPdfDocument, {
      summaryNumber,
      company,
      client,
      groups,
      notes: data.notes,
    });
    const buffer = await renderToBuffer(element as React.ReactElement<DocumentProps>);

    const storagePath = `reportSummaries/${createdId}.pdf`;
    try {
      const bucket = adminStorage.bucket();
      const file = bucket.file(storagePath);
      await file.save(buffer, {
        contentType: "application/pdf",
        metadata: { cacheControl: "private, max-age=31536000" },
      });
      await adminDb.collection(COL).doc(createdId).update({
        pdfStorageRef: storagePath,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (storageErr) {
      logger.warn("Upload PDF riepilogo su Storage fallito (non bloccante)", { storageErr });
    }

    revalidatePath(`/clients/${data.clientId}/reports`);
    return { success: true, data: { id: createdId, number: summaryNumber } };
  } catch (err) {
    logger.error("createReportSummary failed", { err });
    return { success: false, error: "Errore durante la generazione del referto riepilogativo" };
  }
}

// ── Genera/recupera il PDF (per la route di download) ──────────────────
export async function renderReportSummaryPdf(id: string): Promise<{
  buffer: Buffer;
  summary: ReportSummaryDoc;
} | null> {
  await requireAdmin();

  const summary = await getReportSummary(id);
  if (!summary) return null;

  if (summary.pdfStorageRef) {
    const bucket = adminStorage.bucket();
    const [buffer] = await bucket.file(summary.pdfStorageRef).download();
    return { buffer, summary };
  }

  const [client, company] = await Promise.all([
    getClient(summary.clientId),
    getCompanySettings(),
  ]);
  if (!client) return null;

  const groups = await resolveGroups(summary.reportIds);
  const element = React.createElement(ReportSummaryPdfDocument, {
    summaryNumber: summary.number,
    company,
    client,
    groups,
    notes: summary.notes,
  });
  const buffer = await renderToBuffer(element as React.ReactElement<DocumentProps>);
  return { buffer, summary };
}

// ── Invia referto riepilogativo via email (Resend) ─────────────────────
export async function sendReportSummaryByEmail(
  summaryId: string,
  opts: { to: string; subject?: string; body?: string },
): Promise<ActionResult<void>> {
  await requireAdmin();

  try {
    const rendered = await renderReportSummaryPdf(summaryId);
    if (!rendered) return { success: false, error: "Referto riepilogativo non trovato" };
    const { buffer: pdfBuffer, summary } = rendered;

    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@vinifera.app";
    const subject = opts.subject ?? `Referto riepilogativo ${summary.number} — ${summary.clientSnapshot.displayName}`;
    const bodyText = opts.body ?? `In allegato il referto riepilogativo ${summary.number}.\n\nGrazie per aver scelto il nostro laboratorio.`;
    const clientSlug = summary.clientSnapshot.displayName.replace(/\s+/g, '_').replace(/[/\\:*?"<>|]/g, '');
    const filename = `referto-riepilogativo-${summary.number}_${clientSlug}.pdf`;

    await resend.emails.send({
      from: fromEmail,
      to: opts.to,
      subject,
      text: bodyText,
      attachments: [{ filename, content: pdfBuffer }],
    });

    return { success: true, data: undefined };
  } catch (err) {
    logger.error("sendReportSummaryByEmail failed", { err });
    return { success: false, error: "Errore durante l'invio email" };
  }
}
