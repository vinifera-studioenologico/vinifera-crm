"use server";

import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import { AnalysisFormSchema } from "@/schemas/analysis";
import type { AnalysisDoc } from "@/schemas/analysis";
import type { ActionResult } from "@/types";
import { toCents } from "@/lib/utils/money";

const COL = "analyses";

// ── Helper: converti doc Firestore in AnalysisDoc ─────────────────────
function toAnalysisDoc(id: string, data: FirebaseFirestore.DocumentData): AnalysisDoc {
  return {
    id,
    code: data["code"] ?? "",
    name: data["name"] ?? "",
    category: data["category"],
    description: data["description"],
    defaultPriceCents: data["defaultPriceCents"] ?? 0,
    unit: data["unit"],
    active: data["active"] ?? true,
    version: data["version"] ?? 0,
    createdAt: data["createdAt"],
    updatedAt: data["updatedAt"],
    deletedAt: data["deletedAt"] ?? null,
  };
}

// ── Lista analisi ─────────────────────────────────────────────────────
export async function getAnalyses(
  opts: { includeArchived?: boolean } = {},
): Promise<AnalysisDoc[]> {
  await requireAdmin();

  let query = adminDb.collection(COL).orderBy("code");
  if (!opts.includeArchived) {
    query = query.where("deletedAt", "==", null) as typeof query;
  }

  const snap = await query.get();
  return snap.docs.map((d) => toAnalysisDoc(d.id, d.data()));
}

// ── Crea analisi ──────────────────────────────────────────────────────
export async function createAnalysis(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const actor = await requireAdmin();

  // Validazione Zod: zEurInput trasforma la stringa in centesimi
  const parsed = AnalysisFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path]!.push(issue.message);
    }
    return { success: false, error: "Dati non validi", fieldErrors };
  }

  const { defaultPriceCents, ...rest } = parsed.data;

  try {
    // §18.8 — Unicità codice solo tra record non archiviati
    const codeConflict = await adminDb
      .collection(COL)
      .where("code", "==", rest.code)
      .where("deletedAt", "==", null)
      .limit(1)
      .get();

    if (!codeConflict.empty) {
      return {
        success: false,
        error: "Codice già in uso",
        fieldErrors: { code: ["Questo codice è già utilizzato da un'altra analisi attiva"] },
      };
    }

    const docRef = adminDb.collection(COL).doc();
    await docRef.set({
      ...rest,
      defaultPriceCents,
      version: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deletedAt: null,
      createdBy: actor.uid,
    });

    revalidatePath("/analyses");
    logger.info("Analisi creata", { id: docRef.id, code: rest.code });
    return { success: true, data: { id: docRef.id } };
  } catch (err) {
    logger.error("Errore creazione analisi", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

// ── Aggiorna analisi ──────────────────────────────────────────────────
export async function updateAnalysis(
  id: string,
  raw: unknown,
  expectedVersion: number,
): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  const parsed = AnalysisFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path]!.push(issue.message);
    }
    return { success: false, error: "Dati non validi", fieldErrors };
  }

  const { defaultPriceCents, ...rest } = parsed.data;

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const docRef = adminDb.collection(COL).doc(id);
      const snap = await tx.get(docRef);

      if (!snap.exists) return "not_found";

      const current = snap.data()!;

      // §16.5 — Optimistic concurrency
      if (current["version"] !== expectedVersion) return "conflict";

      // §18.8 — Unicità codice (escludi il doc corrente)
      const codeConflictSnap = await tx.get(
        adminDb
          .collection(COL)
          .where("code", "==", rest.code)
          .where("deletedAt", "==", null)
          .limit(1) as FirebaseFirestore.Query,
      );
      if (!codeConflictSnap.empty && codeConflictSnap.docs[0]!.id !== id) {
        return "code_conflict";
      }

      tx.update(docRef, {
        ...rest,
        defaultPriceCents,
        version: expectedVersion + 1,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });

      return "ok";
    });

    if (result === "not_found") return { success: false, error: "Analisi non trovata" };
    if (result === "conflict") return { success: false, error: "Il documento è stato modificato da un'altra sessione. Ricarica la pagina." };
    if (result === "code_conflict") return { success: false, error: "Codice già in uso", fieldErrors: { code: ["Questo codice è già utilizzato da un'altra analisi attiva"] } };

    revalidatePath("/analyses");
    logger.info("Analisi aggiornata", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore aggiornamento analisi", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

// ── Archivia analisi (soft delete) ────────────────────────────────────
export async function archiveAnalysis(id: string): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    await adminDb.collection(COL).doc(id).update({
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });

    revalidatePath("/analyses");
    logger.info("Analisi archiviata", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore archiviazione analisi", err);
    return { success: false, error: "Errore durante l'archiviazione. Riprova." };
  }
}

// ── Ripristina analisi archiviata ─────────────────────────────────────
export async function restoreAnalysis(id: string): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    await adminDb.collection(COL).doc(id).update({
      deletedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });

    revalidatePath("/analyses");
    logger.info("Analisi ripristinata", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore ripristino analisi", err);
    return { success: false, error: "Errore durante il ripristino. Riprova." };
  }
}
