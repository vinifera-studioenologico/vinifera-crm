"use server";

import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import { tsToISO } from "@/lib/utils/date";
import { GoalFormSchema, type GoalDoc } from "@/schemas/goal";
import type { ActionResult } from "@/types";
import { computeGoalProgress, type GoalMetricProgress } from "@/lib/calc/goals";

const COL = "goals";

function toGoalDoc(id: string, data: FirebaseFirestore.DocumentData): GoalDoc {
  return {
    id,
    year: data["year"] ?? parseInt(id, 10),
    revenueTargetCents: data["revenueTargetCents"] ?? undefined,
    newBusinessClientsTarget: data["newBusinessClientsTarget"] ?? undefined,
    newPrivateClientsTarget: data["newPrivateClientsTarget"] ?? undefined,
    notes: data["notes"] ?? undefined,
    version: data["version"] ?? 0,
    createdAt: tsToISO(data["createdAt"]),
    updatedAt: tsToISO(data["updatedAt"]),
    deletedAt: tsToISO(data["deletedAt"]) ?? null,
  };
}

// ── Lettura obiettivo di un anno ────────────────────────────────────────
export async function getGoal(year: number): Promise<GoalDoc | null> {
  await requireAdmin();

  const snap = await adminDb.collection(COL).doc(String(year)).get();
  if (!snap.exists) return null;
  return toGoalDoc(snap.id, snap.data()!);
}

// ── Anni per cui esiste un obiettivo (storico) ──────────────────────────
export async function getGoalYears(): Promise<number[]> {
  await requireAdmin();

  const snap = await adminDb.collection(COL).orderBy("year", "desc").get();
  return snap.docs.map((d) => (d.data()["year"] as number) ?? parseInt(d.id, 10));
}

// ── Avanzamento rispetto ai dati reali ──────────────────────────────────
export interface GoalProgress {
  year: number;
  hasGoals: boolean;
  revenue: GoalMetricProgress | null;
  newBusinessClients: GoalMetricProgress | null;
  newPrivateClients: GoalMetricProgress | null;
  notes?: string;
}

export async function getGoalProgress(year: number): Promise<GoalProgress> {
  await requireAdmin();

  const now = new Date();
  const yearStart = Timestamp.fromDate(new Date(year, 0, 1));
  const yearEnd = Timestamp.fromDate(new Date(year, 11, 31, 23, 59, 59, 999));

  const [goalSnap, paidInstallmentsSnap, clientsSnap] = await Promise.all([
    adminDb.collection(COL).doc(String(year)).get(),
    // Stessa identica forma di query di getMonthlyStats: il fatturato
    // dell'obiettivo non può divergere da "Entrate mensili" nelle statistiche.
    adminDb
      .collectionGroup("installments")
      .where("status", "==", "paid")
      .where("paidAt", ">=", yearStart)
      .where("paidAt", "<=", yearEnd)
      .get(),
    adminDb
      .collection("clients")
      .where("deletedAt", "==", null)
      .where("createdAt", ">=", yearStart)
      .where("createdAt", "<=", yearEnd)
      .get(),
  ]);

  const goalData = goalSnap.exists ? goalSnap.data()! : null;

  const revenueCurrent = paidInstallmentsSnap.docs.reduce(
    (sum, d) =>
      sum +
      ((d.data()["paidAmountCents"] as number | null) ?? (d.data()["amountCents"] as number | null) ?? 0),
    0,
  );

  let newBusinessCount = 0;
  let newPrivateCount = 0;
  for (const doc of clientsSnap.docs) {
    if (doc.data()["type"] === "business") newBusinessCount++;
    else if (doc.data()["type"] === "individual") newPrivateCount++;
  }

  return {
    year,
    hasGoals: goalData != null,
    revenue: computeGoalProgress(
      (goalData?.["revenueTargetCents"] as number | null) ?? undefined,
      revenueCurrent,
      now,
      year,
    ),
    newBusinessClients: computeGoalProgress(
      (goalData?.["newBusinessClientsTarget"] as number | null) ?? undefined,
      newBusinessCount,
      now,
      year,
    ),
    newPrivateClients: computeGoalProgress(
      (goalData?.["newPrivateClientsTarget"] as number | null) ?? undefined,
      newPrivateCount,
      now,
      year,
    ),
    notes: (goalData?.["notes"] as string | undefined) ?? undefined,
  };
}

// ── Imposta/aggiorna l'obiettivo di un anno ─────────────────────────────
export async function upsertGoal(raw: unknown): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  const parsed = GoalFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path]!.push(issue.message);
    }
    return { success: false, error: "Dati non validi", fieldErrors };
  }

  const { year, revenueTargetCents, newBusinessClientsTarget, newPrivateClientsTarget, notes } = parsed.data;
  const docRef = adminDb.collection(COL).doc(String(year));

  try {
    const snap = await docRef.get();

    // L'Admin SDK rifiuta i campi undefined: un target non impostato si scrive null.
    await docRef.set(
      {
        year,
        revenueTargetCents: revenueTargetCents ?? null,
        newBusinessClientsTarget: newBusinessClientsTarget ?? null,
        newPrivateClientsTarget: newPrivateClientsTarget ?? null,
        notes: notes ?? null,
        version: snap.exists ? FieldValue.increment(1) : 0,
        createdAt: snap.exists ? snap.data()!["createdAt"] : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        deletedAt: null,
        updatedBy: actor.uid,
      },
      { merge: true },
    );

    revalidatePath("/obiettivi");
    revalidatePath("/dashboard");
    logger.info("Obiettivo salvato", { year, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore salvataggio obiettivo", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}
