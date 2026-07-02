"use server";

import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import type { LeadDoc, LeadStatus } from "@/schemas/lead";
import { tsToISO } from "@/lib/utils/date";
import type { ActionResult, PaginatedResult } from "@/types";

const COL = "leads";
const PAGE_SIZE = 50;

// ── Helper: converti doc Firestore in LeadDoc ─────────────────────────
function toLeadDoc(id: string, data: FirebaseFirestore.DocumentData): LeadDoc {
  return {
    id,
    name: data["name"] ?? "",
    phone: data["phone"] ?? "",
    email: data["email"],
    message: data["message"],
    serviceId: data["serviceId"] ?? "",
    serviceTitle: data["serviceTitle"] ?? "",
    source: data["source"] ?? "manual",
    status: data["status"] ?? "new",
    locale: data["locale"] ?? "it",
    pageUrl: data["pageUrl"],
    utmSource: data["utmSource"],
    utmMedium: data["utmMedium"],
    utmCampaign: data["utmCampaign"],
    notes: data["notes"],
    createdAt: tsToISO(data["createdAt"]),
    updatedAt: tsToISO(data["updatedAt"]),
  };
}

// ── Lista lead paginata ───────────────────────────────────────────────
export async function getLeads(opts: {
  status?: LeadStatus;
  cursor?: string;
} = {}): Promise<PaginatedResult<LeadDoc>> {
  await requireAdmin();

  let query = adminDb.collection(COL).orderBy("createdAt", "desc") as FirebaseFirestore.Query;

  if (opts.status) {
    query = adminDb
      .collection(COL)
      .where("status", "==", opts.status)
      .orderBy("createdAt", "desc") as FirebaseFirestore.Query;
  }

  // Cursor-based pagination
  if (opts.cursor) {
    const cursorDoc = await adminDb.collection(COL).doc(opts.cursor).get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc) as FirebaseFirestore.Query;
    }
  }

  const snap = await query.limit(PAGE_SIZE + 1).get();
  const docs = snap.docs.slice(0, PAGE_SIZE).map((d) => toLeadDoc(d.id, d.data()));
  const hasMore = snap.docs.length > PAGE_SIZE;
  const nextCursor = hasMore ? snap.docs[PAGE_SIZE - 1]!.id : null;

  return { items: docs, nextCursor, hasMore };
}

// ── Singolo lead ──────────────────────────────────────────────────────
export async function getLead(id: string): Promise<LeadDoc | null> {
  await requireAdmin();

  const snap = await adminDb.collection(COL).doc(id).get();
  if (!snap.exists) return null;
  return toLeadDoc(snap.id, snap.data()!);
}

// ── Aggiorna status lead ──────────────────────────────────────────────
export async function updateLeadStatus(
  id: string,
  status: LeadStatus,
  notes?: string,
): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    const updateData: Record<string, unknown> = {
      status,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    };
    // NON includere notes se undefined — Firestore lancia su valori undefined
    if (notes !== undefined) updateData["notes"] = notes;

    await adminDb.collection(COL).doc(id).update(updateData);

    revalidatePath("/leads");
    logger.info("Lead aggiornato", { id, status, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore aggiornamento lead", err);
    return { success: false, error: "Errore durante l'aggiornamento. Riprova." };
  }
}
