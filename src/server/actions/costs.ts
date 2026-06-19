"use server";

import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import { tsToISO } from "@/lib/utils/date";
import type { ActionResult } from "@/types";
import type { ZodIssue } from "zod";
import {
  ExpenseFormSchema,
  FixedCostFormSchema,
  KitFormSchema,
  CostsSettingsSchema,
  type ExpenseDoc,
  type FixedCostDoc,
  type KitDoc,
  type CostsSettingsValues,
} from "@/schemas/cost";

// ── Collection references ─────────────────────────────────────────────
const EXPENSES_COL = "costExpenses";
const FIXED_COSTS_COL = "costFixedCosts";
const KITS_COL = "costKits";
const COSTS_SETTINGS_DOC = "settings/costs";

// ── Index-not-ready helper (error code 9) ─────────────────────────────
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

// ── Zod fieldErrors helper ────────────────────────────────────────────
function zodFieldErrors(issues: ZodIssue[]) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const path = issue.path.map((p) => String(p)).join(".");
    if (!fieldErrors[path]) fieldErrors[path] = [];
    fieldErrors[path]!.push(issue.message);
  }
  return fieldErrors;
}

// ═══════════════════════════════════════════════════════════════════════
// EXPENSES
// ═══════════════════════════════════════════════════════════════════════

function toExpenseDoc(id: string, data: FirebaseFirestore.DocumentData): ExpenseDoc {
  return {
    id,
    description: data["description"] ?? "",
    category: data["category"] ?? "other",
    supplier: data["supplier"],
    invoiceNumber: data["invoiceNumber"],
    date: data["date"] ?? "",
    periodFrom: data["periodFrom"] || undefined,
    periodTo: data["periodTo"] || undefined,
    totalCents: data["totalCents"] ?? 0,
    notes: data["notes"],
    items: data["items"],
    pdfStoragePath: data["pdfStoragePath"] ?? null,
    pdfUrl: data["pdfUrl"] ?? null,
    aiParsed: data["aiParsed"] ?? false,
    aiConfidence: data["aiConfidence"],
    fileHash: data["fileHash"] ?? undefined,
    linkedKitIds: data["linkedKitIds"],
    kitOfferRef: data["kitOfferRef"] ?? null,
    version: data["version"] ?? 0,
    createdAt: tsToISO(data["createdAt"]),
    updatedAt: tsToISO(data["updatedAt"]),
    deletedAt: tsToISO(data["deletedAt"]) ?? null,
  };
}

export async function getExpenses(
  opts: { month?: string; year?: number } = {},
): Promise<ExpenseDoc[]> {
  await requireAdmin();

  let query = adminDb
    .collection(EXPENSES_COL)
    .where("deletedAt", "==", null) as FirebaseFirestore.Query;

  if (opts.year != null && opts.month != null) {
    // opts.month is "01".."12" zero-padded
    const from = `${opts.year}-${opts.month}-01`;
    const lastDay = new Date(opts.year, parseInt(opts.month, 10), 0).getDate();
    const to = `${opts.year}-${opts.month}-${String(lastDay).padStart(2, "0")}`;
    query = query.where("date", ">=", from).where("date", "<=", to);
  } else if (opts.year != null) {
    const from = `${opts.year}-01-01`;
    const to = `${opts.year}-12-31`;
    query = query.where("date", ">=", from).where("date", "<=", to);
  }

  query = query.orderBy("date", "desc");

  const snap = await safeGet(query);
  return snap.docs.map((d) => toExpenseDoc(d.id, d.data()));
}

export async function getExpense(id: string): Promise<ExpenseDoc | null> {
  await requireAdmin();

  const snap = await adminDb.collection(EXPENSES_COL).doc(id).get();
  if (!snap.exists) return null;
  return toExpenseDoc(snap.id, snap.data()!);
}

export async function createExpense(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const actor = await requireAdmin();

  const parsed = ExpenseFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Dati non validi", fieldErrors: zodFieldErrors(parsed.error.issues) };
  }

  const { totalCents, ...rest } = parsed.data;

  try {
    const docRef = adminDb.collection(EXPENSES_COL).doc();
    await docRef.set({
      ...rest,
      totalCents,
      pdfStoragePath: null,
      pdfUrl: null,
      aiParsed: false,
      version: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deletedAt: null,
      createdBy: actor.uid,
    });

    revalidatePath("/costs");
    revalidatePath("/costs/expenses");
    logger.info("Spesa creata", { id: docRef.id });
    return { success: true, data: { id: docRef.id } };
  } catch (err) {
    logger.error("Errore creazione spesa", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

export async function updateExpense(
  id: string,
  raw: unknown,
  expectedVersion: number,
): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  const parsed = ExpenseFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Dati non validi", fieldErrors: zodFieldErrors(parsed.error.issues) };
  }

  const { totalCents, ...rest } = parsed.data;

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const docRef = adminDb.collection(EXPENSES_COL).doc(id);
      const snap = await tx.get(docRef);
      if (!snap.exists) return "not_found";
      if (snap.data()!["version"] !== expectedVersion) return "conflict";

      tx.update(docRef, {
        ...rest,
        totalCents,
        version: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
      return "ok";
    });

    if (result === "not_found") return { success: false, error: "Spesa non trovata" };
    if (result === "conflict") return { success: false, error: "Il documento è stato modificato da un'altra sessione. Ricarica la pagina." };

    revalidatePath("/costs");
    revalidatePath("/costs/expenses");
    logger.info("Spesa aggiornata", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore aggiornamento spesa", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

export async function deleteExpense(id: string): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    await adminDb.collection(EXPENSES_COL).doc(id).update({
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });

    revalidatePath("/costs");
    revalidatePath("/costs/expenses");
    logger.info("Spesa eliminata (soft)", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore eliminazione spesa", err);
    return { success: false, error: "Errore durante l'eliminazione. Riprova." };
  }
}

// ── URL firmato per PDF allegato ──────────────────────────────────────
export async function getExpensePdfUrl(storagePath: string): Promise<string | null> {
  await requireAdmin();
  if (!storagePath) return null;

  // Proxy URL: il browser riceve Content-Disposition: inline
  return `/api/costs/file?path=${encodeURIComponent(storagePath)}`;
}

// ═══════════════════════════════════════════════════════════════════════
// FIXED COSTS
// ═══════════════════════════════════════════════════════════════════════

function toFixedCostDoc(id: string, data: FirebaseFirestore.DocumentData): FixedCostDoc {
  return {
    id,
    name: data["name"] ?? "",
    description: data["description"],
    amountCents: data["amountCents"] ?? 0,
    frequency: data["frequency"] ?? "monthly",
    paymentDay: data["paymentDay"] ?? 1,
    paymentMonth: data["paymentMonth"] ?? undefined,
    active: data["active"] ?? true,
    notifyTelegram: data["notifyTelegram"] ?? true,
    notifyEmail: data["notifyEmail"] ?? false,
    reminderDaysBefore: data["reminderDaysBefore"] ?? 3,
    version: data["version"] ?? 0,
    createdAt: tsToISO(data["createdAt"]),
    updatedAt: tsToISO(data["updatedAt"]),
    deletedAt: tsToISO(data["deletedAt"]) ?? null,
  };
}

export async function getFixedCosts(
  opts: { includeInactive?: boolean } = {},
): Promise<FixedCostDoc[]> {
  await requireAdmin();

  let query = adminDb
    .collection(FIXED_COSTS_COL)
    .where("deletedAt", "==", null) as FirebaseFirestore.Query;

  if (!opts.includeInactive) {
    query = query.where("active", "==", true);
  }

  query = query.orderBy("name");

  const snap = await safeGet(query);
  return snap.docs.map((d) => toFixedCostDoc(d.id, d.data()));
}

export async function createFixedCost(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const actor = await requireAdmin();

  const parsed = FixedCostFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Dati non validi", fieldErrors: zodFieldErrors(parsed.error.issues) };
  }

  const { amountCents, ...rest } = parsed.data;

  try {
    const docRef = adminDb.collection(FIXED_COSTS_COL).doc();
    await docRef.set({
      ...rest,
      paymentMonth: rest.paymentMonth ?? null,
      amountCents,
      version: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deletedAt: null,
      createdBy: actor.uid,
    });

    revalidatePath("/costs");
    revalidatePath("/costs/fixed");
    logger.info("Costo fisso creato", { id: docRef.id, name: rest.name });
    return { success: true, data: { id: docRef.id } };
  } catch (err) {
    logger.error("Errore creazione costo fisso", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

export async function updateFixedCost(
  id: string,
  raw: unknown,
  expectedVersion: number,
): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  const parsed = FixedCostFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Dati non validi", fieldErrors: zodFieldErrors(parsed.error.issues) };
  }

  const { amountCents, ...rest } = parsed.data;

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const docRef = adminDb.collection(FIXED_COSTS_COL).doc(id);
      const snap = await tx.get(docRef);
      if (!snap.exists) return "not_found";
      if (snap.data()!["version"] !== expectedVersion) return "conflict";

      tx.update(docRef, {
        ...rest,
        paymentMonth: rest.paymentMonth ?? null,
        amountCents,
        version: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
      return "ok";
    });

    if (result === "not_found") return { success: false, error: "Costo fisso non trovato" };
    if (result === "conflict") return { success: false, error: "Il documento è stato modificato da un'altra sessione. Ricarica la pagina." };

    revalidatePath("/costs");
    revalidatePath("/costs/fixed");
    logger.info("Costo fisso aggiornato", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore aggiornamento costo fisso", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

export async function deleteFixedCost(id: string): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    await adminDb.collection(FIXED_COSTS_COL).doc(id).update({
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });

    revalidatePath("/costs");
    revalidatePath("/costs/fixed");
    logger.info("Costo fisso eliminato (soft)", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore eliminazione costo fisso", err);
    return { success: false, error: "Errore durante l'eliminazione. Riprova." };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// KITS
// ═══════════════════════════════════════════════════════════════════════

function toKitDoc(id: string, data: FirebaseFirestore.DocumentData): KitDoc {
  return {
    id,
    supplierArticleCode: data["supplierArticleCode"] ?? "",
    supplierName: data["supplierName"],
    name: data["name"] ?? "",
    analysisId: data["analysisId"] || undefined,
    analysisCodeSnapshot: data["analysisCodeSnapshot"] ?? null,
    analysisNameSnapshot: data["analysisNameSnapshot"] ?? null,
    numberOfTests: data["numberOfTests"] ?? 1,
    lastPurchasePriceCents: data["lastPurchasePriceCents"] ?? 0,
    costPerTestCents: data["costPerTestCents"] ?? 0,
    version: data["version"] ?? 0,
    createdAt: tsToISO(data["createdAt"]),
    updatedAt: tsToISO(data["updatedAt"]),
    deletedAt: tsToISO(data["deletedAt"]) ?? null,
  };
}

export async function getKits(): Promise<KitDoc[]> {
  await requireAdmin();

  const snap = await adminDb
    .collection(KITS_COL)
    .where("deletedAt", "==", null)
    .orderBy("name")
    .get();

  return snap.docs.map((d) => toKitDoc(d.id, d.data()));
}

export async function createKit(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const actor = await requireAdmin();

  const parsed = KitFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Dati non validi", fieldErrors: zodFieldErrors(parsed.error.issues) };
  }

  const { lastPurchasePriceCents, numberOfTests, ...rest } = parsed.data;
  const costPerTestCents = Math.round(lastPurchasePriceCents / numberOfTests);

  try {
    const docRef = adminDb.collection(KITS_COL).doc();
    await docRef.set({
      ...rest,
      numberOfTests,
      lastPurchasePriceCents,
      costPerTestCents,
      version: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deletedAt: null,
      createdBy: actor.uid,
    });

    revalidatePath("/costs");
    revalidatePath("/costs/kits");
    logger.info("Kit creato", { id: docRef.id, name: rest.name });
    return { success: true, data: { id: docRef.id } };
  } catch (err) {
    logger.error("Errore creazione kit", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

export async function updateKit(
  id: string,
  raw: unknown,
  expectedVersion: number,
): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  const parsed = KitFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Dati non validi", fieldErrors: zodFieldErrors(parsed.error.issues) };
  }

  const { lastPurchasePriceCents, numberOfTests, ...rest } = parsed.data;
  const costPerTestCents = Math.round(lastPurchasePriceCents / numberOfTests);

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const docRef = adminDb.collection(KITS_COL).doc(id);
      const snap = await tx.get(docRef);
      if (!snap.exists) return "not_found";
      if (snap.data()!["version"] !== expectedVersion) return "conflict";

      tx.update(docRef, {
        ...rest,
        numberOfTests,
        lastPurchasePriceCents,
        costPerTestCents,
        version: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
      return "ok";
    });

    if (result === "not_found") return { success: false, error: "Kit non trovato" };
    if (result === "conflict") return { success: false, error: "Il documento è stato modificato da un'altra sessione. Ricarica la pagina." };

    revalidatePath("/costs");
    revalidatePath("/costs/kits");
    logger.info("Kit aggiornato", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore aggiornamento kit", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

export async function deleteKit(id: string): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    await adminDb.collection(KITS_COL).doc(id).update({
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });

    revalidatePath("/costs");
    revalidatePath("/costs/kits");
    logger.info("Kit eliminato (soft)", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore eliminazione kit", err);
    return { success: false, error: "Errore durante l'eliminazione. Riprova." };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════

const COSTS_SETTINGS_DEFAULTS: CostsSettingsValues = {
  defaultMarginPercent: 5,
  estimatedMonthlyAnalyses: 100,
  costAllocationPercent: 100,
  productConfigPdfPath: null,
  productConfigPdfUrl: null,
};

export async function getCostsSettings(): Promise<CostsSettingsValues> {
  await requireAdmin();

  const snap = await adminDb.doc(COSTS_SETTINGS_DOC).get();
  if (!snap.exists) return COSTS_SETTINGS_DEFAULTS;

  const data = snap.data();
  if (!data) return COSTS_SETTINGS_DEFAULTS;

  const parsed = CostsSettingsSchema.safeParse(data);
  if (!parsed.success) {
    logger.warn("Costs settings malformed in Firestore", parsed.error);
    return COSTS_SETTINGS_DEFAULTS;
  }

  return parsed.data;
}

export async function updateCostsSettings(raw: unknown): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  const parsed = CostsSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Dati non validi", fieldErrors: zodFieldErrors(parsed.error.issues) };
  }

  try {
    await adminDb.doc(COSTS_SETTINGS_DOC).set(
      {
        ...parsed.data,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      },
      { merge: true },
    );

    revalidatePath("/costs/settings");
    revalidatePath("/costs");
    logger.info("Costs settings aggiornate", { uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore aggiornamento costs settings", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CALCOLI AGGREGATI (implementati allo Step 10)
// ═══════════════════════════════════════════════════════════════════════

export interface CostsSummary {
  totalExpensesCents: number;        // tutte le spese (cassa)
  kitPurchasesCents: number;         // di cui acquisti kit
  overheadExpensesCents: number;     // spese non-kit
  totalFixedMonthlyCents: number;
  totalMonthlyCents: number;
  estimatedCostPerAnalysisCents: number; // overhead/analisi + kit medio
  overheadPerAnalysisCents: number;
  averageSellingPriceCents: number;
  marginPercent: number;
  kitsCount: number;
  avgCostPerTestCents: number;
}

export async function getCostsSummary(
  month?: number,
  year?: number,
): Promise<CostsSummary> {
  await requireAdmin();

  const now = new Date();
  const targetMonth = month ?? now.getMonth() + 1;
  const targetYear = year ?? now.getFullYear();
  const monthStr = String(targetMonth).padStart(2, "0");

  const from = `${targetYear}-${monthStr}-01`;
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  const to = `${targetYear}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

  const [expensesSnap, fixedCostsSnap, kitsSnap, analysesSnap, settings] =
    await Promise.all([
      // Fetch ALL non-deleted expenses (we need to check period overlap, not just date)
      safeGet(
        adminDb
          .collection(EXPENSES_COL)
          .where("deletedAt", "==", null),
      ),
      adminDb
        .collection(FIXED_COSTS_COL)
        .where("deletedAt", "==", null)
        .where("active", "==", true)
        .get(),
      adminDb.collection(KITS_COL).where("deletedAt", "==", null).get(),
      adminDb
        .collection("analyses")
        .where("deletedAt", "==", null)
        .where("active", "==", true)
        .get(),
      getCostsSettings(),
    ]);

  // ── Spese: prorata per periodo, separa cassa totale da acquisti kit ──────
  // Una spesa contribuisce al mese target se:
  //   a) ha un periodo (periodFrom/periodTo) che si sovrappone al mese target
  //      → importo proratizzato sui mesi coperti dal periodo
  //   b) oppure la sua date cade nel mese target (comportamento classico)
  let totalExpensesCents = 0;
  let kitPurchasesCents = 0;
  for (const d of expensesSnap.docs) {
    const data = d.data();
    const amount: number = data["totalCents"] ?? 0;
    const expDate: string = data["date"] ?? "";
    const pFrom: string | undefined = data["periodFrom"];
    const pTo: string | undefined = data["periodTo"];

    let contribution = 0;

    if (pFrom && pTo && pFrom <= pTo) {
      // Calcola quanti mesi copre il periodo e quanti si sovrappongono al target
      const periodStartYear = parseInt(pFrom.slice(0, 4), 10);
      const periodStartMonth = parseInt(pFrom.slice(5, 7), 10);
      const periodEndYear = parseInt(pTo.slice(0, 4), 10);
      const periodEndMonth = parseInt(pTo.slice(5, 7), 10);
      const totalMonths = (periodEndYear - periodStartYear) * 12 + (periodEndMonth - periodStartMonth) + 1;

      // Controlla se il mese target è compreso nel periodo
      const targetYM = targetYear * 100 + targetMonth;
      const fromYM = periodStartYear * 100 + periodStartMonth;
      const toYM = periodEndYear * 100 + periodEndMonth;

      if (targetYM >= fromYM && targetYM <= toYM) {
        contribution = Math.round(amount / totalMonths);
      }
    } else if (expDate >= from && expDate <= to) {
      // Nessun periodo → comportamento classico: date nel mese target
      contribution = amount;
    }

    if (contribution > 0) {
      totalExpensesCents += contribution;
      if (data["category"] === "kit_purchase") kitPurchasesCents += contribution;
    }
  }
  const overheadExpensesCents = totalExpensesCents - kitPurchasesCents;

  // ── Pro-rata mensile costi fissi (invariato) ──────────────────────────────
  const totalFixedMonthlyCents = fixedCostsSnap.docs.reduce((sum, d) => {
    const data = d.data();
    const amount: number = data["amountCents"] ?? 0;
    const freq: string = data["frequency"] ?? "monthly";
    if (freq === "monthly") return sum + amount;
    if (freq === "quarterly") return sum + Math.round(amount / 3);
    if (freq === "annual") return sum + Math.round(amount / 12);
    return sum;
  }, 0);

  // ── Cassa reale del mese (invariato) ───────────────────────────────────────
  const totalMonthlyCents = totalExpensesCents + totalFixedMonthlyCents;

  // ── Kit: media costo/test ─────────────────────────────────────────────────
  // Media non pesata su tutti i kit: approssimazione accettabile per KPI aggregato.
  const kitsCount = kitsSnap.docs.length;
  const avgCostPerTestCents =
    kitsCount > 0
      ? Math.round(
          kitsSnap.docs.reduce((sum, d) => sum + (d.data()["costPerTestCents"] ?? 0), 0) /
            kitsCount,
        )
      : 0;

  // ── Costo stimato per analisi (anti doppio-conteggio) ───────────────────────
  // Solo `costAllocationPercent`% dei costi indiretti (overhead non-kit + fissi)
  // è imputato alle analisi; il resto è a carico delle altre attività aziendali.
  // Il costo diretto kit (avgCostPerTest) resta invece al 100%.
  const estimated = settings.estimatedMonthlyAnalyses;
  const allocableIndirectCents = Math.round(
    (overheadExpensesCents + totalFixedMonthlyCents) * (settings.costAllocationPercent / 100),
  );
  const overheadPerAnalysisCents =
    estimated > 0 ? Math.round(allocableIndirectCents / estimated) : 0;
  const estimatedCostPerAnalysisCents = overheadPerAnalysisCents + avgCostPerTestCents;

  // ── Media prezzo di listino analisi attive (invariato) ──────────────────────
  const activeAnalyses = analysesSnap.docs;
  const averageSellingPriceCents =
    activeAnalyses.length > 0
      ? Math.round(
          activeAnalyses.reduce((sum, d) => sum + (d.data()["defaultPriceCents"] ?? 0), 0) /
            activeAnalyses.length,
        )
      : 0;

  // ── Margine medio (guardia divisione per zero) ─────────────────────────────
  const marginPercent =
    averageSellingPriceCents > 0
      ? Math.round(
          ((averageSellingPriceCents - estimatedCostPerAnalysisCents) / averageSellingPriceCents) *
            100,
        )
      : 0;

  return {
    totalExpensesCents,
    kitPurchasesCents,
    overheadExpensesCents,
    totalFixedMonthlyCents,
    totalMonthlyCents,
    estimatedCostPerAnalysisCents,
    overheadPerAnalysisCents,
    averageSellingPriceCents,
    marginPercent,
    kitsCount,
    avgCostPerTestCents,
  };
}

export interface SuggestedPricing {
  analysisId: string;
  analysisCode: string;
  analysisName: string;
  currentPriceCents: number;
  kitCostPerTestCents: number | null;
  fixedCostQuotaCents: number;
  totalCostCents: number;
  suggestedPriceCents: number;
  marginPercent: number;
  belowCost: boolean;
  /** Valori grezzi di derivazione (per info/debug del calcolo). */
  totalFixedMonthlyCents: number;
  avgMonthlyOverheadCents: number;
  estimatedMonthlyAnalyses: number;
  allocationPercent: number;
  marginPercentTarget: number;
}

export async function getSuggestedPricing(): Promise<SuggestedPricing[]> {
  await requireAdmin();

  const [analysesSnap, kitsSnap, fixedCostsSnap, expensesSnap, settings] = await Promise.all([
    adminDb
      .collection("analyses")
      .where("deletedAt", "==", null)
      .where("active", "==", true)
      .orderBy("code")
      .get(),
    adminDb.collection(KITS_COL).where("deletedAt", "==", null).get(),
    adminDb
      .collection(FIXED_COSTS_COL)
      .where("deletedAt", "==", null)
      .where("active", "==", true)
      .get(),
    // Tutte le spese non eliminate: serve controllare l'overlap di periodo, non solo la date
    safeGet(adminDb.collection(EXPENSES_COL).where("deletedAt", "==", null)),
    getCostsSettings(),
  ]);

  // Pro-rata mensile costi fissi
  const totalFixedMonthlyCents = fixedCostsSnap.docs.reduce((sum, d) => {
    const data = d.data();
    const amount: number = data["amountCents"] ?? 0;
    const freq: string = data["frequency"] ?? "monthly";
    if (freq === "monthly") return sum + amount;
    if (freq === "quarterly") return sum + Math.round(amount / 3);
    if (freq === "annual") return sum + Math.round(amount / 12);
    return sum;
  }, 0);

  // ── Media mensile spese generali (overhead) sugli ultimi 12 mesi ────────────
  // IMPORTANTE: escludiamo la categoria "kit_purchase" per NON contare due volte
  // i kit — il loro costo è già imputato tramite costPerTestCents del kit.
  const WINDOW_MONTHS = 12;
  const now = new Date();
  const currentIdx = now.getFullYear() * 12 + now.getMonth(); // indice mese corrente
  const windowStartIdx = currentIdx - (WINDOW_MONTHS - 1);

  let overheadWindowCents = 0;
  for (const d of expensesSnap.docs) {
    const data = d.data();
    if (data["category"] === "kit_purchase") continue; // anti doppio-conteggio kit
    const amount: number = data["totalCents"] ?? 0;
    const expDate: string = data["date"] ?? "";
    const pFrom: string | undefined = data["periodFrom"];
    const pTo: string | undefined = data["periodTo"];

    if (pFrom && pTo && pFrom <= pTo) {
      // Spesa con periodo → quota mensile distribuita sui mesi coperti dal periodo;
      // sommiamo solo le quote dei mesi che cadono nella finestra 12m.
      const fromIdx =
        parseInt(pFrom.slice(0, 4), 10) * 12 + (parseInt(pFrom.slice(5, 7), 10) - 1);
      const toIdx = parseInt(pTo.slice(0, 4), 10) * 12 + (parseInt(pTo.slice(5, 7), 10) - 1);
      const totalMonths = toIdx - fromIdx + 1;
      const perMonth = totalMonths > 0 ? Math.round(amount / totalMonths) : 0;
      for (let idx = fromIdx; idx <= toIdx; idx++) {
        if (idx >= windowStartIdx && idx <= currentIdx) overheadWindowCents += perMonth;
      }
    } else if (expDate) {
      // Nessun periodo → la spesa pesa sul mese della sua date.
      const idx =
        parseInt(expDate.slice(0, 4), 10) * 12 + (parseInt(expDate.slice(5, 7), 10) - 1);
      if (Number.isFinite(idx) && idx >= windowStartIdx && idx <= currentIdx) {
        overheadWindowCents += amount;
      }
    }
  }
  const avgMonthlyOverheadCents = Math.round(overheadWindowCents / WINDOW_MONTHS);

  const estimated = settings.estimatedMonthlyAnalyses;
  const allocationPercent = settings.costAllocationPercent;

  // Quota mensile di costi indiretti (fissi + overhead) imputata alle analisi.
  // Solo `allocationPercent`% è a carico delle analisi: il resto è attribuito
  // alle altre attività aziendali.
  const allocableMonthlyCents = Math.round(
    (totalFixedMonthlyCents + avgMonthlyOverheadCents) * (allocationPercent / 100),
  );
  const fixedCostQuotaCents = estimated > 0 ? Math.round(allocableMonthlyCents / estimated) : 0;

  // Mappa analysisId → somma costPerTestCents di tutti i kit associati
  const kitByAnalysisId = new Map<string, number>();
  for (const d of kitsSnap.docs) {
    const data = d.data();
    const aId = data["analysisId"] as string | null;
    if (!aId) continue;
    const prev = kitByAnalysisId.get(aId) ?? 0;
    kitByAnalysisId.set(aId, prev + (data["costPerTestCents"] ?? 0));
  }

  const margin = settings.defaultMarginPercent;
  // Margine inteso SUL RICAVO (coerente con la colonna "Margine %"):
  //   prezzo = costo / (1 − margine/100)
  // così il prezzo suggerito ottiene davvero il margine target sul prezzo.
  const marginFactor = margin < 100 ? 1 - margin / 100 : 0;

  return analysesSnap.docs.map((d) => {
    const data = d.data();
    const analysisId = d.id;
    const currentPriceCents: number = data["defaultPriceCents"] ?? 0;
    const kitCostPerTestCents = kitByAnalysisId.has(analysisId)
      ? (kitByAnalysisId.get(analysisId) ?? 0)
      : null;

    const totalCostCents =
      fixedCostQuotaCents + (kitCostPerTestCents !== null ? kitCostPerTestCents : 0);

    const suggestedPriceCents =
      marginFactor > 0 ? Math.round(totalCostCents / marginFactor) : totalCostCents;

    const marginPercent =
      currentPriceCents > 0
        ? Math.round(((currentPriceCents - totalCostCents) / currentPriceCents) * 100)
        : 0;

    return {
      analysisId,
      analysisCode: data["code"] ?? "",
      analysisName: data["name"] ?? "",
      currentPriceCents,
      kitCostPerTestCents,
      fixedCostQuotaCents,
      totalCostCents,
      suggestedPriceCents,
      marginPercent,
      belowCost: currentPriceCents < totalCostCents,
      totalFixedMonthlyCents,
      avgMonthlyOverheadCents,
      estimatedMonthlyAnalyses: estimated,
      allocationPercent,
      marginPercentTarget: margin,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════
// IMPORT AI KIT — PREPARAZIONE RECAP
// ═══════════════════════════════════════════════════════════════════════

import { matchAnalysis, normalize, type MatchResult } from "@/lib/calc/kit-match";
import type { ParsedOfferLine } from "@/app/api/costs/parse-offer/route";

export type KitAction = "create" | "update";

export interface KitImportRow {
  // dati estratti (editabili lato client)
  articleCode: string | null;
  description: string;
  name: string;
  format: string | null;
  quantity: number;
  unitPriceCents: number;
  numberOfTests: number | null;
  // match analisi
  match: MatchResult;
  analysisId: string | null;
  analysisCode: string | null;
  analysisName: string | null;
  // stato kit esistente
  action: KitAction;
  existingKitId: string | null;
  existingKitVersion: number | null;
  existingPriceCents: number | null;
  // completezza
  blockers: string[];
  // segnalazioni non bloccanti
  anomalies: string[];
}

export interface KitImportPreparation {
  rows: KitImportRow[];
  globalWarnings: string[];
}

export async function prepareKitImport(parsed: {
  lines: ParsedOfferLine[];
  warnings?: string[];
}): Promise<KitImportPreparation> {
  await requireAdmin();

  // ── Carica analisi non archiviate e kit esistenti in parallelo ────
  const [analysesSnap, kitsSnap] = await Promise.all([
    adminDb
      .collection("analyses")
      .where("deletedAt", "==", null)
      .get(),
    adminDb
      .collection(KITS_COL)
      .where("deletedAt", "==", null)
      .get(),
  ]);

  const analyses = analysesSnap.docs.map((d) => ({
    id: d.id,
    code: String(d.data()["code"] ?? ""),
    name: String(d.data()["name"] ?? ""),
  }));

  // Mappa codice articolo normalizzato → kit esistente
  const existingByCode = new Map<string, FirebaseFirestore.DocumentData & { id: string }>();
  for (const d of kitsSnap.docs) {
    const data = d.data();
    const code = normalize(data["supplierArticleCode"] as string | undefined);
    if (code) existingByCode.set(code, { ...data, id: d.id });
  }

  // ── Costruisci le righe ───────────────────────────────────────────
  const rows: KitImportRow[] = parsed.lines.map((line) => {
    const nameProposed = (line.description ?? "").trim() || (line.articleCode ?? "");

    const existing = line.articleCode
      ? existingByCode.get(normalize(line.articleCode))
      : undefined;

    const match = matchAnalysis(
      { articleCode: line.articleCode, description: line.description },
      analyses,
    );

    // Pre-selezione analisi
    let analysisId: string | null = null;
    let analysisCode: string | null = null;
    let analysisName: string | null = null;

    if (existing) {
      // Kit già anagrafato: usa l'analisi registrata, non ri-matchare
      analysisId = String(existing["analysisId"] ?? "");
      analysisCode = String(existing["analysisCodeSnapshot"] ?? "");
      analysisName = String(existing["analysisNameSnapshot"] ?? "");
    } else if (match.best && match.best.score >= 0.3) {
      analysisId = match.best.analysisId;
      analysisCode = match.best.code;
      analysisName = match.best.name;
    }

    const action: KitAction = existing ? "update" : "create";

    // numberOfTests: kit esistente ha priorità
    let numberOfTests: number | null = null;
    if (existing) {
      numberOfTests = (existing["numberOfTests"] as number) ?? null;
    } else {
      numberOfTests = line.numberOfTests;
    }

    // ── Blockers ──────────────────────────────────────────────────
    const blockers: string[] = [];
    if (numberOfTests == null || numberOfTests < 1) blockers.push("needs_tests");
    if (line.unitPriceCents <= 0) blockers.push("bad_price");

    // ── Anomalies ─────────────────────────────────────────────────
    const anomalies: string[] = [];

    if (!analysisId) anomalies.push("needs_analysis");

    if (existing) {
      anomalies.push("already_exists");
      const existingPrice = (existing["lastPurchasePriceCents"] as number) ?? 0;
      if (
        existingPrice > 0 &&
        Math.abs(line.unitPriceCents - existingPrice) / existingPrice > 0.3
      ) {
        anomalies.push("big_price_change");
      }
    }

    if (!existing && match.level === "low" && (!match.best || match.best.score < 0.3)) {
      anomalies.push("no_analysis_match");
    }

    if (!existing && match.best && match.best.score >= 0.3 && match.best.score < 0.5) {
      anomalies.push("uncertain_match");
    }

    if (
      match.candidates.length >= 2 &&
      match.candidates[0]!.score - match.candidates[1]!.score < 0.1
    ) {
      anomalies.push("ambiguous_match");
    }

    if (
      line.quantity > 0 &&
      Math.abs(line.unitPriceCents * line.quantity - line.lineTotalCents) > 50
    ) {
      anomalies.push("price_mismatch");
    }

    if (line.confidence < 0.6) anomalies.push("low_confidence");

    return {
      articleCode: line.articleCode,
      description: line.description,
      name: nameProposed,
      format: line.format,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      numberOfTests,
      match,
      analysisId,
      analysisCode,
      analysisName,
      action,
      existingKitId: existing ? existing["id"] : null,
      existingKitVersion: existing ? ((existing["version"] as number) ?? 0) : null,
      existingPriceCents: existing ? ((existing["lastPurchasePriceCents"] as number) ?? null) : null,
      blockers,
      anomalies,
    };
  });

  // ── Check trasversali → globalWarnings ───────────────────────────
  const globalWarnings: string[] = [...(parsed.warnings ?? [])];

  // duplicate_article
  const articleCodeCount = new Map<string, number>();
  for (const row of rows) {
    if (!row.articleCode) continue;
    const key = normalize(row.articleCode);
    articleCodeCount.set(key, (articleCodeCount.get(key) ?? 0) + 1);
  }
  const duplicates = [...articleCodeCount.entries()]
    .filter(([, c]) => c > 1)
    .map(([k]) => k);
  if (duplicates.length > 0) {
    globalWarnings.push(`duplicate_article: codici articolo ripetuti nell'offerta (${duplicates.join(", ")})`);
  }

  return { rows, globalWarnings };
}
