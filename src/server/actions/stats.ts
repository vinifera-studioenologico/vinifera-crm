"use server";

import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
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
    receivedAt: d["receivedAt"],
    estimatedTotalCents: d["estimatedTotalCents"] ?? 0,
    version: d["version"] ?? 0,
    createdAt: d["createdAt"],
    updatedAt: d["updatedAt"],
  };
}

function toReminderDoc(id: string, d: FirebaseFirestore.DocumentData): ReminderDoc {
  return {
    id,
    title: d["title"] ?? "",
    description: d["description"],
    dueAt: d["dueAt"],
    relatedTo: d["relatedTo"],
    status: d["status"] ?? "pending",
    remindBeforeMinutes: d["remindBeforeMinutes"],
    notifyChannels: d["notifyChannels"] ?? { telegram: false, email: false },
    notifiedAt: d["notifiedAt"],
    doneAt: d["doneAt"],
    recurrence: d["recurrence"],
    createdAt: d["createdAt"],
    updatedAt: d["updatedAt"],
  };
}

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

  // Esegui tutte le query in parallelo
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
    adminDb
      .collectionGroup("installments")
      .where("status", "==", "paid")
      .where("paidAt", ">=", monthStart)
      .where("paidAt", "<=", monthEnd)
      .get(),

    // Rate pending nei prossimi 90 giorni
    adminDb
      .collectionGroup("installments")
      .where("status", "==", "pending")
      .where("dueAt", "<=", in90Days)
      .get(),

    // Rate overdue
    adminDb
      .collectionGroup("installments")
      .where("status", "==", "overdue")
      .get(),

    // Campioni attivi (pending + in_progress)
    adminDb
      .collection("samples")
      .where("status", "in", ["pending", "in_progress"])
      .where("deletedAt", "==", null)
      .get(),

    // Preventivi in attesa
    adminDb
      .collection("quotes")
      .where("status", "==", "sent")
      .where("deletedAt", "==", null)
      .get(),

    // Pacchetti attivi
    adminDb
      .collection("clientPackages")
      .where("status", "==", "active")
      .get(),

    // Clienti attivi
    adminDb
      .collection("clients")
      .where("deletedAt", "==", null)
      .get(),

    // Ultimi 5 campioni
    adminDb
      .collection("samples")
      .where("deletedAt", "==", null)
      .orderBy("createdAt", "desc")
      .limit(5)
      .get(),

    // Prossimi 5 promemoria
    adminDb
      .collection("reminders")
      .where("status", "==", "pending")
      .orderBy("dueAt", "asc")
      .limit(5)
      .get(),
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
  attesoContents: number; // preventivato (campioni stimati)
}

const MONTHS_IT = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];

export async function getMonthlyStats(year?: number): Promise<MonthlyRevenue[]> {
  await requireAdmin();

  const targetYear = year ?? new Date().getFullYear();
  const yearStart = Timestamp.fromDate(new Date(targetYear, 0, 1));
  const yearEnd = Timestamp.fromDate(new Date(targetYear, 11, 31, 23, 59, 59));

  const [paidSnap, samplesSnap] = await Promise.all([
    adminDb
      .collectionGroup("installments")
      .where("status", "==", "paid")
      .where("paidAt", ">=", yearStart)
      .where("paidAt", "<=", yearEnd)
      .get(),

    adminDb
      .collection("samples")
      .where("deletedAt", "==", null)
      .where("createdAt", ">=", yearStart)
      .where("createdAt", "<=", yearEnd)
      .get(),
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

  // Raggruppa stimato campioni per mese
  const estimatedByMonth: Record<number, number> = {};
  for (const doc of samplesSnap.docs) {
    const d = doc.data();
    const createdAt = d["createdAt"] as Timestamp | null;
    if (!createdAt) continue;
    const month = createdAt.toDate().getMonth();
    const cents = (d["estimatedTotalCents"] as number | null) ?? 0;
    estimatedByMonth[month] = (estimatedByMonth[month] ?? 0) + cents;
  }

  return Array.from({ length: 12 }, (_, i) => ({
    month: MONTHS_IT[i] ?? String(i + 1),
    year: targetYear,
    incassatoCents: revenueByMonth[i] ?? 0,
    attesoContents: estimatedByMonth[i] ?? 0,
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

  const snap = await adminDb
    .collection("samples")
    .where("createdAt", ">=", sixMonthsAgo)
    .get();

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
