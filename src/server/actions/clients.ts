"use server";

import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import { ClientFormSchema } from "@/schemas/client";
import type { ClientDoc } from "@/schemas/client";
import { tsToISO } from "@/lib/utils/date";
import type { ActionResult, PaginatedResult } from "@/types";

const COL = "clients";
const PAGE_SIZE = 25;

// ── Converti documento Firestore in ClientDoc ─────────────────────────
function toClientDoc(id: string, data: FirebaseFirestore.DocumentData): ClientDoc {
  const base = {
    id,
    displayName: data["displayName"] ?? "",
    email: data["email"] ?? "",
    phone: data["phone"] ?? "",
    address: data["address"],
    billingAddress: data["billingAddress"],
    notes: data["notes"],
    tags: data["tags"] ?? [],
    stats: {
      activePackagesCount: data["stats"]?.activePackagesCount ?? 0,
      remainingAnalyses: data["stats"]?.remainingAnalyses ?? 0,
      totalRevenueCents: data["stats"]?.totalRevenueCents ?? 0,
      pendingAmountCents: data["stats"]?.pendingAmountCents ?? 0,
      overdueAmountCents: data["stats"]?.overdueAmountCents ?? 0,
      samplesPending: data["stats"]?.samplesPending ?? 0,
    },
    version: data["version"] ?? 0,
    createdAt: tsToISO(data["createdAt"]),
    updatedAt: tsToISO(data["updatedAt"]),
    deletedAt: tsToISO(data["deletedAt"]) ?? null,
  };

  if (data["type"] === "business") {
    return {
      ...base,
      type: "business",
      vatNumber: data["vatNumber"] ?? "",
      sdiCode: data["sdiCode"],
      pec: data["pec"],
      taxCode: data["taxCode"],
    };
  }

  return {
    ...base,
    type: "individual",
    firstName: data["firstName"] ?? "",
    lastName: data["lastName"] ?? "",
    taxCode: data["taxCode"],
    vatNumber: data["vatNumber"],
  };
}

// ── Lista clienti paginata ────────────────────────────────────────────
export async function getClients(opts: {
  search?: string;
  cursor?: string;
  includeArchived?: boolean;
} = {}): Promise<PaginatedResult<ClientDoc>> {
  await requireAdmin();

  let query = adminDb.collection(COL).orderBy("displayName");

  if (!opts.includeArchived) {
    query = query.where("deletedAt", "==", null) as typeof query;
  }

  // Cursor-based pagination
  if (opts.cursor) {
    const cursorDoc = await adminDb.collection(COL).doc(opts.cursor).get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc) as typeof query;
    }
  }

  const snap = await query.limit(PAGE_SIZE + 1).get();
  const docs = snap.docs.slice(0, PAGE_SIZE).map((d) => toClientDoc(d.id, d.data()));
  const hasMore = snap.docs.length > PAGE_SIZE;
  const nextCursor = hasMore ? snap.docs[PAGE_SIZE - 1]!.id : null;

  return { items: docs, nextCursor, hasMore };
}

// ── Cerca clienti (full-text semplice via displayName prefix) ─────────
export async function searchClients(query: string): Promise<ClientDoc[]> {
  await requireAdmin();

  if (!query.trim()) return [];

  // Firestore non ha full-text — usiamo range query sul displayName
  const end = query + "\uf8ff";
  const snap = await adminDb
    .collection(COL)
    .where("deletedAt", "==", null)
    .where("displayName", ">=", query)
    .where("displayName", "<=", end)
    .orderBy("displayName")
    .limit(10)
    .get();

  return snap.docs.map((d) => toClientDoc(d.id, d.data()));
}

// ── Singolo cliente ───────────────────────────────────────────────────
export async function getClient(id: string): Promise<ClientDoc | null> {
  await requireAdmin();

  const snap = await adminDb.collection(COL).doc(id).get();
  if (!snap.exists) return null;
  return toClientDoc(snap.id, snap.data()!);
}

// ── Crea cliente ──────────────────────────────────────────────────────
export async function createClient(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const actor = await requireAdmin();

  const parsed = ClientFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path]!.push(issue.message);
    }
    return { success: false, error: "Dati non validi", fieldErrors };
  }

  try {
    const docRef = adminDb.collection(COL).doc();
    await docRef.set({
      ...parsed.data,
      stats: {
        activePackagesCount: 0,
        remainingAnalyses: 0,
        totalRevenueCents: 0,
        pendingAmountCents: 0,
        overdueAmountCents: 0,
        samplesPending: 0,
      },
      version: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deletedAt: null,
      createdBy: actor.uid,
    });

    revalidatePath("/clients");
    logger.info("Cliente creato", { id: docRef.id, type: parsed.data.type });
    return { success: true, data: { id: docRef.id } };
  } catch (err) {
    logger.error("Errore creazione cliente", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

// ── Aggiorna cliente ──────────────────────────────────────────────────
export async function updateClient(
  id: string,
  raw: unknown,
  expectedVersion: number,
): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  const parsed = ClientFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path]!.push(issue.message);
    }
    return { success: false, error: "Dati non validi", fieldErrors };
  }

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const docRef = adminDb.collection(COL).doc(id);
      const snap = await tx.get(docRef);

      if (!snap.exists) return "not_found";
      if (snap.data()!["version"] !== expectedVersion) return "conflict";

      tx.update(docRef, {
        ...parsed.data,
        version: expectedVersion + 1,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });

      return "ok";
    });

    if (result === "not_found") return { success: false, error: "Cliente non trovato" };
    if (result === "conflict") return { success: false, error: "Il documento è stato modificato da un'altra sessione. Ricarica la pagina." };

    revalidatePath("/clients");
    revalidatePath(`/clients/${id}`);
    logger.info("Cliente aggiornato", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore aggiornamento cliente", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

// ── Archivia cliente (soft delete) ────────────────────────────────────
export async function archiveClient(id: string): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    await adminDb.collection(COL).doc(id).update({
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });

    revalidatePath("/clients");
    revalidatePath(`/clients/${id}`);
    logger.info("Cliente archiviato", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore archiviazione cliente", err);
    return { success: false, error: "Errore durante l'archiviazione. Riprova." };
  }
}

// ── Ripristina cliente ────────────────────────────────────────────────
export async function restoreClient(id: string): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    await adminDb.collection(COL).doc(id).update({
      deletedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });

    revalidatePath("/clients");
    revalidatePath(`/clients/${id}`);
    logger.info("Cliente ripristinato", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore ripristino cliente", err);
    return { success: false, error: "Errore durante il ripristino. Riprova." };
  }
}

// ── Esporta tutti i dati del cliente (GDPR Art. 15 / Art. 20) ─────────
export async function exportClientData(
  clientId: string,
): Promise<ActionResult<Record<string, unknown>>> {
  await requireAdmin();

  function serializeValue(value: unknown): unknown {
    if (value == null) return value;
    if (typeof value === "object") {
      const v = value as Record<string, unknown>;
      if (typeof v["toDate"] === "function") {
        return (v["toDate"] as () => Date)().toISOString();
      }
      if (Array.isArray(value)) return (value as unknown[]).map(serializeValue);
      const result: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) result[k] = serializeValue(val);
      return result;
    }
    return value;
  }

  function toDoc(
    snap: FirebaseFirestore.DocumentSnapshot,
  ): Record<string, unknown> {
    return {
      id: snap.id,
      ...(serializeValue(snap.data()!) as Record<string, unknown>),
    };
  }

  try {
    const clientSnap = await adminDb.collection("clients").doc(clientId).get();
    if (!clientSnap.exists) return { success: false, error: "Cliente non trovato" };

    const [samples, payments, quotes, reports, packages, reminders] =
      await Promise.all([
        adminDb
          .collection("samples")
          .where("clientId", "==", clientId)
          .orderBy("createdAt", "desc")
          .limit(500)
          .get(),
        adminDb
          .collection("payments")
          .where("clientId", "==", clientId)
          .orderBy("createdAt", "desc")
          .limit(500)
          .get(),
        adminDb
          .collection("quotes")
          .where("clientId", "==", clientId)
          .orderBy("createdAt", "desc")
          .limit(500)
          .get(),
        adminDb
          .collection("reports")
          .where("clientId", "==", clientId)
          .orderBy("createdAt", "desc")
          .limit(500)
          .get(),
        adminDb
          .collection("clientPackages")
          .where("clientId", "==", clientId)
          .limit(500)
          .get(),
        adminDb
          .collection("reminders")
          .where("relatedTo.kind", "==", "client")
          .where("relatedTo.id", "==", clientId)
          .orderBy("dueAt", "desc")
          .limit(500)
          .get(),
      ]);

    return {
      success: true,
      data: {
        exportedAt: new Date().toISOString(),
        cliente: toDoc(clientSnap),
        campioni: samples.docs.map(toDoc),
        pagamenti: payments.docs.map(toDoc),
        preventivi: quotes.docs.map(toDoc),
        referti: reports.docs.map(toDoc),
        pacchetti: packages.docs.map(toDoc),
        promemoria: reminders.docs.map(toDoc),
      },
    };
  } catch (err) {
    logger.error("Errore export dati cliente", err);
    return { success: false, error: "Errore durante l'esportazione. Riprova." };
  }
}
