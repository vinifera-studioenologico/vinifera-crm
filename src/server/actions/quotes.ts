"use server";

import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import { QuoteFormSchema, isQuoteTransitionAllowed } from "@/schemas/quote";
import type { QuoteDoc, QuoteStatus } from "@/schemas/quote";
import { tsToISO, civilDateToEndOfDay } from "@/lib/utils/date";
import type { ActionResult, PaginatedResult } from "@/types";
import { computeQuoteTotals } from "@/lib/calc/quote";
import { getClient } from "./clients";

const COL = "quotes";
const PAGE_SIZE = 25;

// ── Converti doc Firestore in QuoteDoc ────────────────────────────────
function toQuoteDoc(id: string, data: FirebaseFirestore.DocumentData): QuoteDoc {
  return {
    id,
    number: data["number"] ?? "",
    year: data["year"] ?? 0,
    sequence: data["sequence"] ?? 0,
    clientId: data["clientId"] ?? "",
    clientSnapshot: data["clientSnapshot"] ?? {},
    status: data["status"] ?? "draft",
    issuedAt: tsToISO(data["issuedAt"]),
    validUntil: tsToISO(data["validUntil"]),
    items: data["items"] ?? [],
    subtotalCents: data["subtotalCents"] ?? 0,
    discounts: data["discounts"] ?? [],
    taxes: data["taxes"] ?? [],
    totalCents: data["totalCents"] ?? 0,
    notes: data["notes"],
    paymentTerms: data["paymentTerms"] ?? undefined,
    pdfStorageRef: data["pdfStorageRef"],
    frozenSnapshot: data["frozenSnapshot"]
      ? {
          ...data["frozenSnapshot"],
          issuedAt: tsToISO(data["frozenSnapshot"]["issuedAt"]),
          validUntil: tsToISO(data["frozenSnapshot"]["validUntil"]),
        }
      : undefined,
    approvedAt: tsToISO(data["approvedAt"]),
    approvedBy: data["approvedBy"],
    revision: data["revision"] ?? 1,
    parentQuoteId: data["parentQuoteId"] ?? undefined,
    version: data["version"] ?? 0,
    createdAt: tsToISO(data["createdAt"]),
    updatedAt: tsToISO(data["updatedAt"]),
  };
}

// ── Genera numero progressivo anno/sequenza ───────────────────────────
async function getNextQuoteNumber(
  tx: FirebaseFirestore.Transaction,
  year: number,
): Promise<{ number: string; sequence: number }> {
  const counterRef = adminDb.doc(`counters/quotes_${year}`);
  const counterSnap = await tx.get(counterRef);
  const next = (counterSnap.data()?.[`seq`] ?? 0) + 1;
  tx.set(counterRef, { seq: next }, { merge: true });
  const number = `${year}/${String(next).padStart(4, "0")}`;
  return { number, sequence: next };
}

// ── Lista preventivi ──────────────────────────────────────────────────
export async function getQuotes(opts: {
  clientId?: string;
  status?: QuoteStatus;
  cursor?: string;
} = {}): Promise<PaginatedResult<QuoteDoc>> {
  await requireAdmin();

  let query = adminDb.collection(COL).orderBy("createdAt", "desc");

  if (opts.clientId) {
    query = query.where("clientId", "==", opts.clientId) as typeof query;
  }
  if (opts.status) {
    query = query.where("status", "==", opts.status) as typeof query;
  }

  if (opts.cursor) {
    const cursorDoc = await adminDb.collection(COL).doc(opts.cursor).get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc) as typeof query;
    }
  }

  const snap = await query.limit(PAGE_SIZE + 1).get();
  const docs = snap.docs.slice(0, PAGE_SIZE).map((d) => toQuoteDoc(d.id, d.data()));
  const hasMore = snap.docs.length > PAGE_SIZE;
  const nextCursor = hasMore ? snap.docs[PAGE_SIZE - 1]!.id : null;

  return { items: docs, nextCursor, hasMore };
}

// ── Singolo preventivo ────────────────────────────────────────────────
export async function getQuote(id: string): Promise<QuoteDoc | null> {
  await requireAdmin();

  const snap = await adminDb.collection(COL).doc(id).get();
  if (!snap.exists) return null;
  return toQuoteDoc(snap.id, snap.data()!);
}

// ── Crea preventivo bozza ─────────────────────────────────────────────
export async function createQuote(raw: unknown): Promise<ActionResult<{ id: string; number: string }>> {
  const actor = await requireAdmin();

  const parsed = QuoteFormSchema.safeParse(raw);
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

  // Carica snapshot cliente
  const client = await getClient(data.clientId);
  if (!client) return { success: false, error: "Cliente non trovato" };

  const clientSnapshot = {
    id: client.id,
    displayName: client.displayName,
    email: client.email,
    phone: client.phone,
    vatNumber: client.type === "business" ? client.vatNumber : (client.vatNumber ?? null),
    taxCode: client.taxCode ?? null,
    address: client.address,
    type: client.type,
  };

  // Calcola totali
  const { subtotalCents, totalCents } = computeQuoteTotals({
    items: data.items,
    discounts: data.discounts.map((d) => ({
      type: d.type,
      value: d.type === "fixed" ? Math.round(d.value * 100) : d.value,
    })),
    taxes: data.taxes,
  });

  const year = new Date().getFullYear();

  try {
    let createdId = "";
    let createdNumber = "";

    await adminDb.runTransaction(async (tx) => {
      const { number, sequence } = await getNextQuoteNumber(tx, year);
      createdNumber = number;

      const docRef = adminDb.collection(COL).doc();
      createdId = docRef.id;

      // Converti date stringa in Timestamp (§18.4 — Europe/Rome end-of-day)
      const issuedAt = data.issuedAt
        ? Timestamp.fromDate(civilDateToEndOfDay(data.issuedAt))
        : FieldValue.serverTimestamp();
      const validUntil = data.validUntil
        ? Timestamp.fromDate(civilDateToEndOfDay(data.validUntil))
        : null;

      tx.set(docRef, {
        number,
        year,
        sequence,
        clientId: data.clientId,
        clientSnapshot,
        status: "draft",
        issuedAt,
        validUntil,
        items: data.items,
        subtotalCents,
        discounts: data.discounts.map((d) => ({
          ...d,
          value: d.type === "fixed" ? Math.round(d.value * 100) : d.value,
        })),
        taxes: data.taxes,
        totalCents,
        notes: data.notes ?? null,
        paymentTerms: data.paymentTerms ?? null,
        version: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: actor.uid,
      });
    });

    revalidatePath("/quotes");
    logger.info("Preventivo creato", { id: createdId, number: createdNumber });
    return { success: true, data: { id: createdId, number: createdNumber } };
  } catch (err) {
    logger.error("Errore creazione preventivo", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

// ── Aggiorna bozza preventivo ─────────────────────────────────────────
export async function updateQuote(
  id: string,
  raw: unknown,
  expectedVersion: number,
): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  const parsed = QuoteFormSchema.safeParse(raw);
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

  const { subtotalCents, totalCents } = computeQuoteTotals({
    items: data.items,
    discounts: data.discounts.map((d) => ({
      type: d.type,
      value: d.type === "fixed" ? Math.round(d.value * 100) : d.value,
    })),
    taxes: data.taxes,
  });

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const docRef = adminDb.collection(COL).doc(id);
      const snap = await tx.get(docRef);

      if (!snap.exists) return "not_found";
      const current = snap.data()!;
      if (current["version"] !== expectedVersion) return "conflict";
      if (current["status"] !== "draft") return "not_draft";

      const issuedAt = data.issuedAt
        ? Timestamp.fromDate(civilDateToEndOfDay(data.issuedAt))
        : current["issuedAt"];
      const validUntil = data.validUntil
        ? Timestamp.fromDate(civilDateToEndOfDay(data.validUntil))
        : null;

      tx.update(docRef, {
        clientId: data.clientId,
        issuedAt,
        validUntil,
        items: data.items,
        subtotalCents,
        discounts: data.discounts.map((d) => ({
          ...d,
          value: d.type === "fixed" ? Math.round(d.value * 100) : d.value,
        })),
        taxes: data.taxes,
        totalCents,
        notes: data.notes ?? null,
        paymentTerms: data.paymentTerms ?? null,
        version: expectedVersion + 1,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });

      return "ok";
    });

    if (result === "not_found") return { success: false, error: "Preventivo non trovato" };
    if (result === "conflict") return { success: false, error: "Il documento è stato modificato da un'altra sessione. Ricarica la pagina." };
    if (result === "not_draft") return { success: false, error: "Solo i preventivi in bozza possono essere modificati." };

    revalidatePath("/quotes");
    revalidatePath(`/quotes/${id}`);
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore aggiornamento preventivo", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

// ── Cambia stato preventivo ───────────────────────────────────────────
export async function transitionQuote(
  id: string,
  to: QuoteStatus,
  expectedVersion: number,
): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const docRef = adminDb.collection(COL).doc(id);
      const snap = await tx.get(docRef);

      if (!snap.exists) return "not_found";
      const current = snap.data()!;
      if (current["version"] !== expectedVersion) return "conflict";

      const from = current["status"] as QuoteStatus;
      if (!isQuoteTransitionAllowed(from, to)) {
        return `invalid_transition:${from}->${to}`;
      }

      const update: Record<string, unknown> = {
        status: to,
        version: expectedVersion + 1,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      };

      if (to === "approved") {
        update["approvedAt"] = FieldValue.serverTimestamp();
        update["approvedBy"] = actor.uid;
        // §2.5 — frozenSnapshot completo (non solo items)
        update["frozenSnapshot"] = {
          number: current["number"],
          clientSnapshot: current["clientSnapshot"],
          issuedAt: tsToISO(current["issuedAt"]) ?? null,
          validUntil: tsToISO(current["validUntil"]) ?? null,
          items: current["items"],
          subtotalCents: current["subtotalCents"],
          discounts: current["discounts"],
          taxes: current["taxes"],
          totalCents: current["totalCents"],
          notes: current["notes"] ?? null,
        };
      }

      tx.update(docRef, update);
      return "ok";
    });

    if (result === "not_found") return { success: false, error: "Preventivo non trovato" };
    if (result === "conflict") return { success: false, error: "Il documento è stato modificato. Ricarica la pagina." };
    if (typeof result === "string" && result.startsWith("invalid_transition")) {
      return { success: false, error: "Transizione di stato non consentita." };
    }

    revalidatePath("/quotes");
    revalidatePath(`/quotes/${id}`);
    logger.info("Preventivo: transizione stato", { id, to, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore transizione preventivo", err);
    return { success: false, error: "Errore durante l'operazione. Riprova." };
  }
}

// ── Elimina bozza preventivo ──────────────────────────────────────────
export async function deleteQuote(id: string): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    const snap = await adminDb.collection(COL).doc(id).get();
    if (!snap.exists) return { success: false, error: "Preventivo non trovato" };
    if (snap.data()!["status"] !== "draft") {
      return { success: false, error: "Solo le bozze possono essere eliminate." };
    }

    await adminDb.collection(COL).doc(id).delete();

    revalidatePath("/quotes");
    logger.info("Bozza preventivo eliminata", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore eliminazione bozza", err);
    return { success: false, error: "Errore durante l'eliminazione. Riprova." };
  }
}

// ── Crea nuova revisione ──────────────────────────────────────────────
export async function createQuoteRevision(
  sourceId: string,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requireAdmin();

  try {
    let newId = "";

    await adminDb.runTransaction(async (tx) => {
      const sourceRef = adminDb.collection(COL).doc(sourceId);
      const sourceSnap = await tx.get(sourceRef);
      if (!sourceSnap.exists) throw new Error("not_found");

      const src = sourceSnap.data()!;
      const status = src["status"] as string;
      if (status !== "pending_approval" && status !== "rejected") {
        throw new Error("invalid_status");
      }

      // Segna il vecchio come superseded
      tx.update(sourceRef, {
        status: "superseded",
        version: (src["version"] ?? 0) + 1,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });

      // Crea il clone come bozza con revision incrementata
      const newRef = adminDb.collection(COL).doc();
      newId = newRef.id;

      tx.set(newRef, {
        number: src["number"],
        year: src["year"],
        sequence: src["sequence"],
        clientId: src["clientId"],
        clientSnapshot: src["clientSnapshot"],
        status: "draft",
        issuedAt: FieldValue.serverTimestamp(),
        validUntil: src["validUntil"] ?? null,
        items: src["items"],
        subtotalCents: src["subtotalCents"],
        discounts: src["discounts"],
        taxes: src["taxes"],
        totalCents: src["totalCents"],
        notes: src["notes"] ?? null,
        paymentTerms: src["paymentTerms"] ?? null,
        revision: (src["revision"] ?? 1) + 1,
        parentQuoteId: sourceId,
        version: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: actor.uid,
      });
    });

    revalidatePath("/quotes");
    revalidatePath(`/quotes/${sourceId}`);
    logger.info("Nuova revisione preventivo creata", {
      sourceId,
      newId,
      uid: actor.uid,
    });
    return { success: true, data: { id: newId } };
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "not_found") return { success: false, error: "Preventivo non trovato" };
    if (msg === "invalid_status") {
      return { success: false, error: "La revisione è possibile solo da preventivi inviati o rifiutati." };
    }
    logger.error("Errore creazione revisione preventivo", err);
    return { success: false, error: "Errore durante l'operazione. Riprova." };
  }
}

// ── Invia preventivo via email ────────────────────────────────────────
export async function sendQuoteByEmail(
  quoteId: string,
  opts: { to: string; subject?: string; body?: string },
): Promise<ActionResult<void>> {
  await requireAdmin();

  try {
    const quote = await getQuote(quoteId);
    if (!quote) return { success: false, error: "Preventivo non trovato" };

    const { getCompanySettings } = await import("./settings");
    const company = await getCompanySettings();

    const { renderToBuffer } = await import("@react-pdf/renderer");
    const React = await import("react");
    const { QuotePdfDocument } = await import("@/components/pdf/QuotePdfDocument");

    const element = React.createElement(QuotePdfDocument, { quote, company });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(element as any);

    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@vinifera.app";
    const subject = opts.subject ?? `Preventivo ${quote.number} — ${quote.clientSnapshot.displayName}`;
    const bodyText = opts.body ?? `In allegato il preventivo ${quote.number}.\n\nGrazie per aver scelto il nostro laboratorio.`;
    const clientSlug = quote.clientSnapshot.displayName.replace(/\s+/g, '_').replace(/[/\\:*?"<>|]/g, '');
    const filename = `preventivo-${quote.number.replace("/", "-")}_${clientSlug}.pdf`;

    await resend.emails.send({
      from: fromEmail,
      to: opts.to,
      subject,
      text: bodyText,
      attachments: [{ filename, content: pdfBuffer }],
    });

    logger.info("Preventivo inviato via email", { quoteId, to: opts.to });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("sendQuoteByEmail failed", { err });
    return { success: false, error: "Errore durante l'invio email" };
  }
}

