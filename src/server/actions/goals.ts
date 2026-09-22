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

// ── Index-not-ready helper (error code 9) ─────────────────────────────
// Stesso pattern di stats.ts/costs.ts: un indice composito appena aggiunto
// (qui: clients(deletedAt, createdAt)) può non essere ancora pronto subito
// dopo il deploy — la query degrada a vuoto invece di far esplodere la pagina.
const safeGet = async (query: FirebaseFirestore.Query) => {
  try {
    return await query.get();
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 9) {
      return { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[], size: 0 };
    }
    throw err;
  }
};

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

  const snap = await safeGet(adminDb.collection(COL).orderBy("year", "desc"));
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
  // Stesso yearEnd di getMonthlyStats/getIncomeByMethod (senza i ms): un
  // pagamento nell'ultimo secondo dell'anno deve contare o non contare
  // ovunque allo stesso modo, altrimenti "Fatturato" diverge da "Entrate
  // mensili" e "Incassi per metodo" per quell'installment.
  const yearEnd = Timestamp.fromDate(new Date(year, 11, 31, 23, 59, 59));

  const [goalSnap, paidInstallmentsSnap, clientsSnap] = await Promise.all([
    adminDb.collection(COL).doc(String(year)).get(),
    // Stessa identica forma di query di getMonthlyStats: il fatturato
    // dell'obiettivo non può divergere da "Entrate mensili" nelle statistiche.
    safeGet(
      adminDb
        .collectionGroup("installments")
        .where("status", "==", "paid")
        .where("paidAt", ">=", yearStart)
        .where("paidAt", "<=", yearEnd),
    ),
    safeGet(
      adminDb
        .collection("clients")
        .where("deletedAt", "==", null)
        .where("createdAt", ">=", yearStart)
        .where("createdAt", "<=", yearEnd),
    ),
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
// `expectedVersion`: passato dal client quando modifica un obiettivo
// esistente (concorrenza ottimistica, come le altre mutazioni del
// progetto — es. updateExpense/updateFixedCost). Omesso alla prima
// creazione, dove non c'è ancora nulla con cui confrontarsi.
export async function upsertGoal(
  raw: unknown,
  expectedVersion?: number,
): Promise<ActionResult<void>> {
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
    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);

      if (snap.exists && expectedVersion != null && (snap.data()!["version"] as number) !== expectedVersion) {
        return "conflict";
      }

      // L'Admin SDK rifiuta i campi undefined: un target non impostato si scrive null.
      tx.set(
        docRef,
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
      return "ok";
    });

    if (result === "conflict") {
      return {
        success: false,
        error: "Il documento è stato modificato da un'altra sessione. Ricarica la pagina.",
      };
    }

    revalidatePath("/obiettivi");
    revalidatePath("/dashboard");
    logger.info("Obiettivo salvato", { year, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore salvataggio obiettivo", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}
