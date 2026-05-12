"use server";

import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import { ReminderFormSchema } from "@/schemas/reminder";
import type { ReminderDoc, ReminderStatus } from "@/schemas/reminder";
import { tsToISO } from "@/lib/utils/date";
import type { ActionResult, PaginatedResult } from "@/types";

const COL = "reminders";
const PAGE_SIZE = 50;

// ── Converti doc Firestore ────────────────────────────────────────────
function toReminderDoc(id: string, d: FirebaseFirestore.DocumentData): ReminderDoc {
  return {
    id,
    title: d["title"] ?? "",
    description: d["description"],
    dueAt: tsToISO(d["dueAt"]),
    relatedTo: d["relatedTo"],
    status: d["status"] ?? "pending",
    remindBeforeMinutes: d["remindBeforeMinutes"],
    notifyChannels: d["notifyChannels"] ?? { telegram: false, email: false },
    notifiedAt: tsToISO(d["notifiedAt"]),
    doneAt: tsToISO(d["doneAt"]),
    recurrence: d["recurrence"],
    createdAt: tsToISO(d["createdAt"]),
    updatedAt: tsToISO(d["updatedAt"]),
  };
}

// ── Lista promemoria ──────────────────────────────────────────────────
export async function getReminders(opts: {
  status?: ReminderStatus;
  clientId?: string;
  cursor?: string;
} = {}): Promise<PaginatedResult<ReminderDoc>> {
  await requireAdmin();

  let query = adminDb.collection(COL).orderBy("dueAt", "asc");

  if (opts.status) {
    query = query.where("status", "==", opts.status) as typeof query;
  }
  if (opts.clientId) {
    query = query.where("relatedTo.id", "==", opts.clientId) as typeof query;
  }
  if (opts.cursor) {
    const cursorDoc = await adminDb.collection(COL).doc(opts.cursor).get();
    if (cursorDoc.exists) query = query.startAfter(cursorDoc) as typeof query;
  }

  const snap = await query.limit(PAGE_SIZE + 1).get();
  const docs = snap.docs.map((s) => toReminderDoc(s.id, s.data()));
  const hasMore = docs.length > PAGE_SIZE;
  return {
    items: hasMore ? docs.slice(0, PAGE_SIZE) : docs,
    nextCursor: hasMore ? (docs[PAGE_SIZE - 1]?.id ?? null) : null,
    hasMore,
  };
}

// ── Crea promemoria ───────────────────────────────────────────────────
export async function createReminder(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requireAdmin();

  const parsed = ReminderFormSchema.safeParse(raw);
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

  try {
    const ref = adminDb.collection(COL).doc();
    await ref.set({
      title: data.title,
      description: data.description ?? null,
      dueAt: Timestamp.fromDate(new Date(data.dueAt)),
      relatedTo: data.relatedTo ?? null,
      status: "pending",
      remindBeforeMinutes: data.remindBeforeMinutes ?? null,
      notifyChannels: data.notifyChannels,
      recurrence: data.recurrence ?? null,
      notifiedAt: null,
      doneAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid,
    });

    revalidatePath("/reminders");
    return { success: true, data: { id: ref.id } };
  } catch (err) {
    logger.error("createReminder failed", { err });
    return { success: false, error: "Errore durante la creazione" };
  }
}

// ── Aggiorna promemoria ───────────────────────────────────────────────
export async function updateReminder(
  id: string,
  raw: unknown,
): Promise<ActionResult<void>> {
  await requireAdmin();

  const parsed = ReminderFormSchema.safeParse(raw);
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

  try {
    await adminDb.collection(COL).doc(id).update({
      title: data.title,
      description: data.description ?? null,
      dueAt: Timestamp.fromDate(new Date(data.dueAt)),
      relatedTo: data.relatedTo ?? null,
      remindBeforeMinutes: data.remindBeforeMinutes ?? null,
      notifyChannels: data.notifyChannels,
      recurrence: data.recurrence ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    revalidatePath("/reminders");
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("updateReminder failed", { err });
    return { success: false, error: "Errore durante l'aggiornamento" };
  }
}

// ── Segna come fatto ──────────────────────────────────────────────────
export async function markReminderDone(id: string): Promise<ActionResult<void>> {
  await requireAdmin();
  try {
    await adminDb.collection(COL).doc(id).update({
      status: "done",
      doneAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    revalidatePath("/reminders");
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("markReminderDone failed", { err });
    return { success: false, error: "Errore" };
  }
}

// ── Rimanda (snooze) ──────────────────────────────────────────────────
export async function snoozeReminder(
  id: string,
  days: number,
): Promise<ActionResult<void>> {
  await requireAdmin();
  try {
    const snap = await adminDb.collection(COL).doc(id).get();
    if (!snap.exists) return { success: false, error: "Promemoria non trovato" };

    const current = snap.data()!["dueAt"] as
      | { toDate: () => Date }
      | null;
    const base = current?.toDate?.() ?? new Date();
    const newDue = new Date(base.getTime() + days * 86400 * 1000);

    await adminDb.collection(COL).doc(id).update({
      dueAt: Timestamp.fromDate(newDue),
      status: "pending",
      notifiedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    revalidatePath("/reminders");
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("snoozeReminder failed", { err });
    return { success: false, error: "Errore" };
  }
}

// ── Annulla promemoria ────────────────────────────────────────────────
export async function cancelReminder(id: string): Promise<ActionResult<void>> {
  await requireAdmin();
  try {
    await adminDb.collection(COL).doc(id).update({
      status: "cancelled",
      updatedAt: FieldValue.serverTimestamp(),
    });
    revalidatePath("/reminders");
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("cancelReminder failed", { err });
    return { success: false, error: "Errore" };
  }
}
