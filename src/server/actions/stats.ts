"use server";

import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { tsToISO } from "@/lib/utils/date";
import type { SampleDoc } from "@/schemas/sample";
import type { ReminderDoc } from "@/schemas/reminder";

// ── Helpers ────────────────────────────────────────────────────────────

function toSampleDoc(id: string, d: FirebaseFirestore.DocumentData): SampleDoc {
  return {
    id,
    code: d["code"] ?? "",
    sampleName: d["sampleName"] ?? "",
    clientId: d["clientId"] ?? "",
    clientNameSnapshot: d["clientNameSnapshot"] ?? "",
    status: d["status"] ?? "pending",
    items: d["items"] ?? [],
    notes: d["notes"],
    receivedAt: tsToISO(d["receivedAt"]),
    estimatedTotalCents: d["estimatedTotalCents"] ?? 0,
    version: d["version"] ?? 0,
    createdAt: tsToISO(d["createdAt"]),
    updatedAt: tsToISO(d["updatedAt"]),
  };
}

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

// ── Helpers ──────────────────────────────────────────────────────────
const safeGet = async (query: FirebaseFirestore.Query) => {
  try {
    return await query.get();
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 9) {
      // Index not ready yet — return empty snapshot
      return { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[], size: 0 };
    }
    throw err;
  }
};

// ── KPI Dashboard ─────────────────────────────────────────────────────
export interface DashboardStats {
  incassiMeseCents: number;          // incassato nel mese corrente
  incassiFuturiCents: number;        // rate pending nei prossimi 90 giorni
  scadutoCents: number;              // rate overdue totale
  campioniAttivi: number;            // pending + in_progress
  preventiviInAttesa: number;        // quotes "sent"
  pacchetttiAttivi: number;          // clientPackages "active"
  clientiTotali: number;
  recentSamples: SampleDoc[];
  upcomingReminders: ReminderDoc[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  await requireAdmin();

  const now = new Date();
  const monthStart = Timestamp.fromDate(
    new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
  );
  const monthEnd = Timestamp.fromDate(
    new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  );
  const in90Days = Timestamp.fromDate(
    new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
  );

  const [
    paidInstallmentsSnap,
    futureInstallmentsSnap,
    overdueInstallmentsSnap,
    campioniSnap,
    preventiviSnap,
    pacchetttiSnap,
    clientiSnap,
    recentSamplesSnap,
    upcomingRemindersSnap,
  ] = await Promise.all([
    // Rate pagate questo mese
    safeGet(adminDb
      .collectionGroup("installments")
      .where("status", "==", "paid")
      .where("paidAt", ">=", monthStart)
      .where("paidAt", "<=", monthEnd)),

    // Rate pending nei prossimi 90 giorni
    safeGet(adminDb
      .collectionGroup("installments")
      .where("status", "==", "pending")
      .where("dueAt", "<=", in90Days)),

    // Rate overdue
    safeGet(adminDb
      .collectionGroup("installments")
      .where("status", "==", "overdue")),

    // Campioni attivi (pending + in_progress)
    safeGet(adminDb
      .collection("samples")
      .where("status", "in", ["pending", "in_progress"])
      .where("deletedAt", "==", null)),

    // Preventivi in attesa
    safeGet(adminDb
      .collection("quotes")
      .where("status", "==", "sent")
      .where("deletedAt", "==", null)),

    // Pacchetti attivi
    safeGet(adminDb
      .collection("clientPackages")
      .where("status", "==", "active")),

    // Clienti attivi
    safeGet(adminDb
      .collection("clients")
      .where("deletedAt", "==", null)),

    // Ultimi 5 campioni
    safeGet(adminDb
      .collection("samples")
      .where("deletedAt", "==", null)
      .orderBy("createdAt", "desc")
      .limit(5)),

    // Prossimi 5 promemoria
    safeGet(adminDb
      .collection("reminders")
      .where("status", "==", "pending")
      .orderBy("dueAt", "asc")
      .limit(5)),
  ]);

  const incassiMeseCents = paidInstallmentsSnap.docs.reduce(
    (sum, d) => sum + ((d.data()["paidAmountCents"] as number | null) ?? (d.data()["amountCents"] as number | null) ?? 0),
    0,
  );
  const incassiFuturiCents = futureInstallmentsSnap.docs.reduce(
    (sum, d) => sum + ((d.data()["amountCents"] as number | null) ?? 0),
    0,
  );
  const scadutoCents = overdueInstallmentsSnap.docs.reduce(
    (sum, d) => sum + ((d.data()["amountCents"] as number | null) ?? 0),
    0,
  );

  return {
    incassiMeseCents,
    incassiFuturiCents,
    scadutoCents,
    campioniAttivi: campioniSnap.size,
    preventiviInAttesa: preventiviSnap.size,
    pacchetttiAttivi: pacchetttiSnap.size,
    clientiTotali: clientiSnap.size,
    recentSamples: recentSamplesSnap.docs.map((d) => toSampleDoc(d.id, d.data())),
    upcomingReminders: upcomingRemindersSnap.docs.map((d) =>
      toReminderDoc(d.id, d.data()),
    ),
  };
}

// ── Statistiche mensili (per grafici) ────────────────────────────────
export interface MonthlyRevenue {
  month: string;   // "Gen", "Feb", ...
  year: number;
  incassatoCents: number;
  attesoCents: number; // rate pending/overdue con scadenza nel mese
}

const MONTHS_IT = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];

export async function getMonthlyStats(year?: number): Promise<MonthlyRevenue[]> {
  await requireAdmin();

  const targetYear = year ?? new Date().getFullYear();
  const yearStart = Timestamp.fromDate(new Date(targetYear, 0, 1));
  const yearEnd = Timestamp.fromDate(new Date(targetYear, 11, 31, 23, 59, 59));

  const [paidSnap, pendingSnap] = await Promise.all([
    safeGet(adminDb
      .collectionGroup("installments")
      .where("status", "==", "paid")
      .where("paidAt", ">=", yearStart)
      .where("paidAt", "<=", yearEnd)),

    // Rate non ancora incassate (pending + overdue) con scadenza nell'anno
    safeGet(adminDb
      .collectionGroup("installments")
      .where("status", "in", ["pending", "overdue"])
      .where("dueAt", ">=", yearStart)
      .where("dueAt", "<=", yearEnd)),
  ]);

  // Raggruppa incassato per mese
  const revenueByMonth: Record<number, number> = {};
  for (const doc of paidSnap.docs) {
    const d = doc.data();
    const paidAt = d["paidAt"] as Timestamp | null;
    if (!paidAt) continue;
    const month = paidAt.toDate().getMonth(); // 0-based
    const cents =
      (d["paidAmountCents"] as number | null) ?? (d["amountCents"] as number | null) ?? 0;
    revenueByMonth[month] = (revenueByMonth[month] ?? 0) + cents;
  }

  // Raggruppa da incassare per mese di scadenza
  const pendingByMonth: Record<number, number> = {};
  for (const doc of pendingSnap.docs) {
    const d = doc.data();
    const dueAt = d["dueAt"] as Timestamp | null;
    if (!dueAt) continue;
    const month = dueAt.toDate().getMonth();
    const cents = (d["amountCents"] as number | null) ?? 0;
    pendingByMonth[month] = (pendingByMonth[month] ?? 0) + cents;
  }

  return Array.from({ length: 12 }, (_, i) => ({
    month: MONTHS_IT[i] ?? String(i + 1),
    year: targetYear,
    incassatoCents: revenueByMonth[i] ?? 0,
    attesoCents: pendingByMonth[i] ?? 0,
  }));
}

// ── Campioni per stato (ultimi 6 mesi) ────────────────────────────────
export interface SamplesByMonth {
  month: string;
  pending: number;
  in_progress: number;
  completed: number;
  cancelled: number;
}

export async function getSamplesByMonth(): Promise<SamplesByMonth[]> {
  await requireAdmin();

  const sixMonthsAgo = Timestamp.fromDate(
    new Date(new Date().getTime() - 180 * 24 * 60 * 60 * 1000),
  );

  const snap = await safeGet(adminDb
    .collection("samples")
    .where("createdAt", ">=", sixMonthsAgo));

  const byMonth: Record<
    string,
    { month: string; pending: number; in_progress: number; completed: number; cancelled: number }
  > = {};

  for (const doc of snap.docs) {
    const d = doc.data();
    const createdAt = d["createdAt"] as Timestamp | null;
    if (!createdAt) continue;
    const date = createdAt.toDate();
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = `${MONTHS_IT[date.getMonth()] ?? ""} ${date.getFullYear()}`;

    if (!byMonth[key]) {
      byMonth[key] = { month: monthLabel, pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
    }
    const status = (d["status"] as string) ?? "pending";
    if (status in byMonth[key]!) {
      const entry = byMonth[key]!;
      (entry as unknown as Record<string, unknown>)[status] =
        (((entry as unknown as Record<string, number>)[status]) ?? 0) + 1;
    }
  }

  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
}
