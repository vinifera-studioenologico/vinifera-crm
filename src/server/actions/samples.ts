"use server";

import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import { SampleFormSchema } from "@/schemas/sample";
import type { SampleDoc, SampleStatus } from "@/schemas/sample";
import { tsToISO, civilDateToEndOfDay, generateDueDates } from "@/lib/utils/date";
import type { ActionResult, PaginatedResult } from "@/types";
import { computeSampleTotal, assignPackageCoverage } from "@/lib/calc/sample";
import { splitInCents } from "@/lib/utils/money";
import { getClient } from "./clients";

const COL = "samples";
const PAGE_SIZE = 25;

// ── Converti documento Firestore in SampleDoc ─────────────────────────
function toSampleDoc(id: string, data: FirebaseFirestore.DocumentData): SampleDoc {
  return {
    id,
    code: data["code"] ?? "",
    clientId: data["clientId"] ?? "",
    clientNameSnapshot: data["clientNameSnapshot"] ?? "",
    sampleName: data["sampleName"] ?? "",
    receivedAt: tsToISO(data["receivedAt"]),
    status: data["status"] ?? "pending",
    items: data["items"] ?? [],
    estimatedTotalCents: data["estimatedTotalCents"] ?? 0,
    paymentId: data["paymentId"],
    sourceQuoteId: data["sourceQuoteId"],
    notes: data["notes"],
    additionalNotes: data["additionalNotes"] ?? [],
    cancelledAt: tsToISO(data["cancelledAt"]),
    cancelReason: data["cancelReason"],
    version: data["version"] ?? 0,
    createdAt: tsToISO(data["createdAt"]),
    updatedAt: tsToISO(data["updatedAt"]),
  };
}

// ── Genera codice campione C-YYYY-NNNN ────────────────────────────────
// Separato in read/write per rispettare il vincolo Firestore: tutte le
// letture devono precedere qualsiasi scrittura nella stessa transazione.
async function readSampleCounter(
  tx: FirebaseFirestore.Transaction,
  year: number,
): Promise<FirebaseFirestore.DocumentSnapshot> {
  const counterRef = adminDb.doc(`counters/samples_${year}`);
  return tx.get(counterRef);
}

function writeSampleCodeFromSnap(
  tx: FirebaseFirestore.Transaction,
  year: number,
  snap: FirebaseFirestore.DocumentSnapshot,
): string {
  const next = (snap.data()?.["seq"] ?? 0) + 1;
  tx.set(snap.ref, { seq: next }, { merge: true });
  return `C-${year}-${String(next).padStart(4, "0")}`;
}

// ── Lista campioni ────────────────────────────────────────────────────
export async function getSamples(opts: {
  clientId?: string;
  status?: SampleStatus;
  cursor?: string;
} = {}): Promise<PaginatedResult<SampleDoc>> {
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
  const docs = snap.docs.slice(0, PAGE_SIZE).map((d) => toSampleDoc(d.id, d.data()));
  const hasMore = snap.docs.length > PAGE_SIZE;
  const nextCursor = hasMore ? snap.docs[PAGE_SIZE - 1]!.id : null;

  return { items: docs, nextCursor, hasMore };
}

// ── Singolo campione ──────────────────────────────────────────────────
export async function getSample(id: string): Promise<SampleDoc | null> {
  await requireAdmin();
  const snap = await adminDb.collection(COL).doc(id).get();
  if (!snap.exists) return null;
  return toSampleDoc(snap.id, snap.data()!);
}

// ── Navigazione prev/next tra campioni in lavorazione ─────────────────
export async function getAdjacentInProgressSamples(
  currentId: string,
): Promise<{ prevId: string | null; nextId: string | null }> {
  await requireAdmin();

  const snap = await adminDb
    .collection(COL)
    .where("status", "==", "in_progress")
    .orderBy("createdAt", "desc")
    .select()
    .get();

  const ids = snap.docs.map((d) => d.id);
  const idx = ids.indexOf(currentId);

  if (idx === -1) return { prevId: null, nextId: null };

  return {
    prevId: idx > 0 ? ids[idx - 1]! : null,
    nextId: idx < ids.length - 1 ? ids[idx + 1]! : null,
  };
}

// ── Riepilogo pagamento collegato (per banner avviso disallineamento) ──
export async function getLinkedPaymentSummary(
  paymentId: string,
): Promise<{ totalAmountCents: number; status: string } | null> {
  await requireAdmin();
  const snap = await adminDb.collection("payments").doc(paymentId).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return {
    totalAmountCents: (d["totalAmountCents"] as number) ?? 0,
    status: (d["status"] as string) ?? "pending",
  };
}

// ── Stati in cui il campione è modificabile (items) ───────────────────
const EDITABLE_STATUSES: SampleStatus[] = ["pending", "in_progress"];

// ── Aggiungi analisi a un campione in lavorazione ─────────────────────
export async function addSampleAnalyses(
  sampleId: string,
  analysisIds: string[],
  expectedVersion: number,
): Promise<ActionResult<{ version: number }>> {
  const actor = await requireAdmin();

  if (!Array.isArray(analysisIds) || analysisIds.length === 0) {
    return { success: false, error: "Nessuna analisi selezionata" };
  }

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const sampleRef = adminDb.collection(COL).doc(sampleId);

      // ── FASE LETTURE ──────────────────────────────────────────────
      const sampleSnap = await tx.get(sampleRef);
      if (!sampleSnap.exists) return { code: "not_found" as const };

      const sampleData = sampleSnap.data()!;
      const status = sampleData["status"] as SampleStatus;
      if (!EDITABLE_STATUSES.includes(status)) return { code: "locked" as const };
      if ((sampleData["version"] ?? 0) !== expectedVersion) return { code: "conflict" as const };

      const clientId = sampleData["clientId"] as string;
      const currentItems = (sampleData["items"] ?? []) as SampleDoc["items"];
      const existingIds = new Set(currentItems.map((it) => it.analysisId));

      const uniqueIds = [...new Set(analysisIds)];
      const analysisRefs = uniqueIds.map((id) => adminDb.collection("analyses").doc(id));

      const pkgQuery = adminDb
        .collection("clientPackages")
        .where("clientId", "==", clientId)
        .where("status", "==", "active");

      const [analysisSnaps, pkgQuerySnap] = await Promise.all([
        Promise.all(analysisRefs.map((ref) => tx.get(ref))),
        tx.get(pkgQuery),
      ]);

      // Costruisci snapshot autoritativi (prezzo dal catalogo) per le sole
      // analisi non già presenti nel campione. Le chiavi opzionali sono
      // omesse se prive di valore: l'Admin SDK rifiuta i campi `undefined`.
      const toAdd: SampleDoc["items"] = [];
      for (let i = 0; i < uniqueIds.length; i++) {
        const id = uniqueIds[i]!;
        if (existingIds.has(id)) continue; // già presente: ignora
        const aSnap = analysisSnaps[i]!;
        if (!aSnap.exists) return { code: "analysis_missing" as const };
        const a = aSnap.data()!;
        if (a["deletedAt"] != null) return { code: "analysis_archived" as const };
        const item: SampleDoc["items"][number] = {
          analysisId: id,
          analysisCodeSnapshot: a["code"] ?? "",
          analysisNameSnapshot: a["name"] ?? "",
          unitPriceCents: (a["defaultPriceCents"] as number) ?? 0,
          chargeAnyway: false,
        };
        if (a["unit"]) item.unitSnapshot = a["unit"] as string;
        if (a["description"]) item.descriptionSnapshot = a["description"] as string;
        toAdd.push(item);
      }

      if (toAdd.length === 0) return { code: "noop" as const, version: expectedVersion };

      // Pacchetti attivi ordinati dal più vecchio (consuma prima i vecchi)
      const packages = pkgQuerySnap.docs
        .map((dpkg) => ({
          id: dpkg.id,
          remainingAnalyses: (dpkg.data()["remainingAnalyses"] as number) ?? 0,
          createdAtMs: dpkg.data()["createdAt"]?.toMillis?.() ?? 0,
        }))
        .sort((x, y) => x.createdAtMs - y.createdAtMs);

      const { coverage, decrements } = assignPackageCoverage(
        packages.map((p) => ({ id: p.id, remainingAnalyses: p.remainingAnalyses })),
        toAdd.length,
      );

      toAdd.forEach((item, i) => {
        const pkgId = coverage[i];
        if (pkgId) item.coveredByPackageId = pkgId;
      });

      const newItems = [...currentItems, ...toAdd];
      const newTotal = computeSampleTotal(newItems);
      const newVersion = (sampleData["version"] ?? 0) + 1;

      // ── FASE SCRITTURE ────────────────────────────────────────────
      tx.update(sampleRef, {
        items: newItems,
        estimatedTotalCents: newTotal,
        version: newVersion,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });

      for (const [pkgId, count] of Object.entries(decrements)) {
        const pkg = packages.find((p) => p.id === pkgId)!;
        const remaining = pkg.remainingAnalyses - count;
        tx.update(adminDb.collection("clientPackages").doc(pkgId), {
          remainingAnalyses: Math.max(0, remaining),
          status: remaining <= 0 ? "exhausted" : "active",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      return { code: "ok" as const, version: newVersion };
    });

    if (result.code === "not_found") return { success: false, error: "Campione non trovato" };
    if (result.code === "locked") return { success: false, error: "Il campione non è modificabile in questo stato" };
    if (result.code === "conflict") return { success: false, error: "Il documento è stato modificato. Ricarica la pagina." };
    if (result.code === "analysis_missing") return { success: false, error: "Analisi non trovata" };
    if (result.code === "analysis_archived") return { success: false, error: "Analisi archiviata: non aggiungibile" };

    revalidatePath("/samples");
    revalidatePath(`/samples/${sampleId}`);
    logger.info("Analisi aggiunte al campione", { sampleId, count: analysisIds.length, uid: actor.uid });
    return { success: true, data: { version: result.version } };
  } catch (err) {
    logger.error("Errore aggiunta analisi campione", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

// ── Rimuovi un'analisi da un campione in lavorazione ──────────────────
export async function removeSampleAnalysis(
  sampleId: string,
  analysisId: string,
  expectedVersion: number,
): Promise<ActionResult<{ version: number }>> {
  const actor = await requireAdmin();

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const sampleRef = adminDb.collection(COL).doc(sampleId);

      // ── FASE LETTURE ──────────────────────────────────────────────
      const sampleSnap = await tx.get(sampleRef);
      if (!sampleSnap.exists) return { code: "not_found" as const };

      const data = sampleSnap.data()!;
      const status = data["status"] as SampleStatus;
      if (!EDITABLE_STATUSES.includes(status)) return { code: "locked" as const };
      if ((data["version"] ?? 0) !== expectedVersion) return { code: "conflict" as const };

      const items = (data["items"] ?? []) as SampleDoc["items"];
      const idx = items.findIndex((it) => it.analysisId === analysisId);
      if (idx === -1) return { code: "item_missing" as const };
      if (items.length <= 1) return { code: "min_one" as const };

      const removed = items[idx]!;
      const restorePkgId =
        removed.coveredByPackageId && !removed.chargeAnyway
          ? removed.coveredByPackageId
          : null;

      // Leggi il pacchetto da ripristinare (prima delle scritture)
      const pkgSnap = restorePkgId
        ? await tx.get(adminDb.collection("clientPackages").doc(restorePkgId))
        : null;

      const newItems = items.filter((_, i) => i !== idx);
      const newTotal = computeSampleTotal(newItems);
      const newVersion = (data["version"] ?? 0) + 1;

      // ── FASE SCRITTURE ────────────────────────────────────────────
      tx.update(sampleRef, {
        items: newItems,
        estimatedTotalCents: newTotal,
        version: newVersion,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });

      // Ripristina lo slot nel pacchetto (riattiva se era esaurito, mai se annullato)
      if (pkgSnap?.exists) {
        const pkgStatus = pkgSnap.data()!["status"] as string;
        const newRemaining = ((pkgSnap.data()!["remainingAnalyses"] as number) ?? 0) + 1;
        tx.update(pkgSnap.ref, {
          remainingAnalyses: newRemaining,
          ...(pkgStatus === "exhausted" ? { status: "active" } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      return { code: "ok" as const, version: newVersion };
    });

    if (result.code === "not_found") return { success: false, error: "Campione non trovato" };
    if (result.code === "locked") return { success: false, error: "Il campione non è modificabile in questo stato" };
    if (result.code === "conflict") return { success: false, error: "Il documento è stato modificato. Ricarica la pagina." };
    if (result.code === "item_missing") return { success: false, error: "Analisi non presente nel campione" };
    if (result.code === "min_one") return { success: false, error: "Deve restare almeno un'analisi nel campione" };

    revalidatePath("/samples");
    revalidatePath(`/samples/${sampleId}`);
    logger.info("Analisi rimossa dal campione", { sampleId, analysisId, uid: actor.uid });
    return { success: true, data: { version: result.version } };
  } catch (err) {
    logger.error("Errore rimozione analisi campione", err);
    return { success: false, error: "Errore durante l'eliminazione. Riprova." };
  }
}


// ── Pacchetti attivi del cliente ──────────────────────────────────────
export async function getClientActivePkgs(clientId: string) {
  await requireAdmin();
  const snap = await adminDb
    .collection("clientPackages")
    .where("clientId", "==", clientId)
    .where("status", "==", "active")
    .get();
  return snap.docs.map((d) => ({
    id: d.id,
    packageNameSnapshot: d.data()["packageNameSnapshot"] as string,
    remainingAnalyses: d.data()["remainingAnalyses"] as number,
  }));
}

// ── Crea campione (wizard finale) ─────────────────────────────────────
export async function createSample(raw: unknown): Promise<ActionResult<{ id: string; code: string }>> {
  const actor = await requireAdmin();

  const parsed = SampleFormSchema.safeParse(raw);
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

  const client = await getClient(data.clientId);
  if (!client) return { success: false, error: "Cliente non trovato" };

  const estimatedTotalCents = computeSampleTotal(data.items);
  const year = new Date().getFullYear();

  try {
    let createdId = "";
    let createdCode = "";

    await adminDb.runTransaction(async (tx) => {
      // ── FASE LETTURE — tutte in parallelo, nessuna scrittura ──────────

      // Calcola i pacchetti da decrementare prima di aprire la tx
      const packageDecrements = new Map<string, number>();
      for (const item of data.items) {
        if (item.coveredByPackageId && !item.chargeAnyway) {
          packageDecrements.set(
            item.coveredByPackageId,
            (packageDecrements.get(item.coveredByPackageId) ?? 0) + 1,
          );
        }
      }

      const pkgRefs = [...packageDecrements.keys()].map((pkgId) =>
        adminDb.collection("clientPackages").doc(pkgId),
      );

      // Leggi counter e tutti i pacchetti in parallelo
      const [counterSnap, ...pkgSnapsList] = await Promise.all([
        readSampleCounter(tx, year),
        ...pkgRefs.map((ref) => tx.get(ref)),
      ]);

      const pkgSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      pkgRefs.forEach((ref, i) => pkgSnaps.set(ref.id, pkgSnapsList[i]!));

      // ── FASE SCRITTURE ────────────────────────────────────────────────

      const code = writeSampleCodeFromSnap(tx, year, counterSnap);
      createdCode = code;

      const sampleRef = adminDb.collection(COL).doc();
      createdId = sampleRef.id;

      const receivedAt = data.receivedAt
        ? Timestamp.fromDate(civilDateToEndOfDay(data.receivedAt))
        : FieldValue.serverTimestamp();

      // 3. Crea documento campione
      tx.set(sampleRef, {
        code,
        clientId: data.clientId,
        clientNameSnapshot: client.displayName,
        sampleName: data.sampleName,
        receivedAt,
        status: "pending",
        items: data.items,
        estimatedTotalCents,
        notes: data.notes ?? null,
        version: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: actor.uid,
      });

      // 4. Decrementa contatori pacchetti
      for (const [pkgId, count] of packageDecrements) {
        const pkgSnap = pkgSnaps.get(pkgId);
        if (pkgSnap?.exists) {
          const remaining = (pkgSnap.data()!["remainingAnalyses"] as number) - count;
          const pkgRef = adminDb.collection("clientPackages").doc(pkgId);
          tx.update(pkgRef, {
            remainingAnalyses: Math.max(0, remaining),
            status: remaining <= 0 ? "exhausted" : "active",
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      // 4. Crea pagamento con rate (opzionale)
      if (data.createPayment && estimatedTotalCents > 0) {
        const count = data.installmentsCount ?? 1;
        const firstDue = data.firstDueDate ?? new Date().toISOString().slice(0, 10);
        const period = data.installmentPeriod ?? "monthly";
        const accontoCents = (data.accontoCents as number | undefined) ?? 0;
        const hasAcconto = accontoCents > 0 && count > 1;
        const remaining = hasAcconto ? Math.max(0, estimatedTotalCents - accontoCents) : estimatedTotalCents;
        const isFullyPaid = hasAcconto && remaining === 0;

        const paymentRef = adminDb.collection("payments").doc();
        tx.set(paymentRef, {
          clientId: data.clientId,
          source: { kind: "sample", refId: sampleRef.id, sampleCode: code },
          description: data.sampleName,
          totalAmountCents: estimatedTotalCents,
          paidAmountCents: hasAcconto ? (isFullyPaid ? estimatedTotalCents : accontoCents) : 0,
          status: hasAcconto ? (isFullyPaid ? "paid" : "partial") : "pending",
          installmentsCount: hasAcconto ? (isFullyPaid ? 1 : count + 1) : count,
          version: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          createdBy: actor.uid,
        });

        // Collega il payment al campione
        tx.update(sampleRef, { paymentId: paymentRef.id });

        // Rata 0: acconto già pagato
        if (hasAcconto) {
          const accontoRef = adminDb
            .collection("payments")
            .doc(paymentRef.id)
            .collection("installments")
            .doc();
          const accontoPaidAt = data.accontoDate
            ? Timestamp.fromDate(civilDateToEndOfDay(data.accontoDate))
            : Timestamp.now();
          tx.set(accontoRef, {
            index: 0,
            amountCents: accontoCents,
            paidAmountCents: accontoCents,
            dueAt: accontoPaidAt,
            paidAt: accontoPaidAt,
            status: "paid",
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        // Rate ordinarie sul residuo (o sull'intero se nessun acconto)
        if (!isFullyPaid) {
          const amounts = splitInCents(remaining, count);
          const dueDates = generateDueDates(firstDue, count, period, data.customInterval, data.customUnit);

          for (let i = 0; i < count; i++) {
            const installRef = adminDb
              .collection("payments")
              .doc(paymentRef.id)
              .collection("installments")
              .doc();
            tx.set(installRef, {
              index: i + 1,
              amountCents: amounts[i] ?? 0,
              paidAmountCents: 0,
              dueAt: Timestamp.fromDate(dueDates[i]!),
              status: "pending",
              createdAt: FieldValue.serverTimestamp(),
            });
          }

          // Aggiorna stats cliente solo per il residuo pendente
          const clientRef = adminDb.collection("clients").doc(data.clientId);
          tx.update(clientRef, {
            "stats.pendingAmountCents": FieldValue.increment(remaining),
            "stats.samplesPending": FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          const clientRef = adminDb.collection("clients").doc(data.clientId);
          tx.update(clientRef, {
            "stats.samplesPending": FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      } else {
        // Aggiorna solo samplesPending
        const clientRef = adminDb.collection("clients").doc(data.clientId);
        tx.update(clientRef, {
          "stats.samplesPending": FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    revalidatePath("/samples");
    revalidatePath(`/clients/${data.clientId}`);
    logger.info("Campione creato", { id: createdId, code: createdCode });
    return { success: true, data: { id: createdId, code: createdCode } };
  } catch (err) {
    logger.error("Errore creazione campione", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

// ── Aggiorna stato campione ───────────────────────────────────────────
export async function updateSampleStatus(
  id: string,
  status: SampleStatus,
  opts: { cancelReason?: string } = {},
): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    const txResult = await adminDb.runTransaction(async (tx) => {
      // ── FASE LETTURE ────────────────────────────────────────────────

      const sampleRef = adminDb.collection(COL).doc(id);
      const snap = await tx.get(sampleRef);
      if (!snap.exists) return "not_found";

      const sampleData = snap.data()!;
      const currentStatus = sampleData["status"] as SampleStatus;
      const items = (sampleData["items"] ?? []) as SampleDoc["items"];
      const clientId = sampleData["clientId"] as string;

      // Calcola quali pacchetti ripristinare (solo se cancellazione)
      const packageRestorations = new Map<string, number>();
      if (status === "cancelled") {
        for (const item of items) {
          if (item.coveredByPackageId && !item.chargeAnyway) {
            packageRestorations.set(
              item.coveredByPackageId,
              (packageRestorations.get(item.coveredByPackageId) ?? 0) + 1,
            );
          }
        }
      }

      // Leggi i pacchetti da ripristinare (tutte le letture prima delle scritture)
      const pkgRefs = [...packageRestorations.keys()].map((pkgId) =>
        adminDb.collection("clientPackages").doc(pkgId),
      );
      const pkgSnaps = pkgRefs.length > 0
        ? await Promise.all(pkgRefs.map((ref) => tx.get(ref)))
        : [];

      // ── FASE SCRITTURE ───────────────────────────────────────────────

      const update: Record<string, unknown> = {
        status,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      };
      if (status === "cancelled") {
        update["cancelledAt"] = FieldValue.serverTimestamp();
        update["cancelReason"] = opts.cancelReason ?? "";
      }
      tx.update(sampleRef, update);

      // Decrementa samplesPending quando si esce da uno stato attivo
      const wasActive = currentStatus === "pending" || currentStatus === "in_progress";
      const isTerminal = status === "completed" || status === "cancelled";
      if (wasActive && isTerminal) {
        const clientRef = adminDb.collection("clients").doc(clientId);
        tx.update(clientRef, {
          "stats.samplesPending": FieldValue.increment(-1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // Ripristina analisi nei pacchetti in caso di cancellazione
      pkgRefs.forEach((ref, i) => {
        const pkgSnap = pkgSnaps[i];
        if (!pkgSnap?.exists) return;
        const restoreCount = packageRestorations.get(ref.id) ?? 0;
        const currentPkgStatus = pkgSnap.data()!["status"] as string;
        const newRemaining =
          (pkgSnap.data()!["remainingAnalyses"] as number) + restoreCount;
        tx.update(ref, {
          remainingAnalyses: newRemaining,
          // Riattiva solo se era esaurito, non se è stato annullato esplicitamente
          ...(currentPkgStatus === "exhausted" ? { status: "active" } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      return "ok";
    });

    if (txResult === "not_found") return { success: false, error: "Campione non trovato" };

    revalidatePath("/samples");
    revalidatePath(`/samples/${id}`);
    logger.info("Stato campione aggiornato", { id, status, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore aggiornamento stato campione", err);
    return { success: false, error: "Errore durante l'aggiornamento. Riprova." };
  }
}

// ── Salva risultati analisi ───────────────────────────────────────────
export async function saveSampleResults(
  id: string,
  results: Array<{ analysisId: string; result: string }>,
  expectedVersion: number,
): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const docRef = adminDb.collection(COL).doc(id);
      const snap = await tx.get(docRef);
      if (!snap.exists) return "not_found";
      if (snap.data()!["version"] !== expectedVersion) return "conflict";

      const items = (snap.data()!["items"] as SampleDoc["items"]).map((item) => {
        const found = results.find((r) => r.analysisId === item.analysisId);
        return found ? { ...item, result: found.result } : item;
      });

      tx.update(docRef, {
        items,
        version: expectedVersion + 1,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
      return "ok";
    });

    if (result === "not_found") return { success: false, error: "Campione non trovato" };
    if (result === "conflict") return { success: false, error: "Il documento è stato modificato. Ricarica la pagina." };

    revalidatePath(`/samples/${id}`);
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore salvataggio risultati campione", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

// ── Aggiungi nota aggiuntiva al campione ──────────────────────────────
export async function addSampleNote(
  sampleId: string,
  text: string,
): Promise<ActionResult<void>> {
  await requireAdmin();

  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 2000) {
    return { success: false, error: "Testo nota non valido (max 2000 caratteri)" };
  }

  try {
    const docRef = adminDb.collection(COL).doc(sampleId);
    const noteEntry = {
      id: adminDb.collection("_").doc().id, // genera ID univoco
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    await docRef.update({
      additionalNotes: FieldValue.arrayUnion(noteEntry),
      updatedAt: FieldValue.serverTimestamp(),
    });

    revalidatePath(`/samples/${sampleId}`);
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore aggiunta nota campione", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

// ── Elimina nota aggiuntiva dal campione ──────────────────────────────
export async function deleteSampleNote(
  sampleId: string,
  noteId: string,
): Promise<ActionResult<void>> {
  await requireAdmin();

  try {
    const docRef = adminDb.collection(COL).doc(sampleId);
    const snap = await docRef.get();
    if (!snap.exists) return { success: false, error: "Campione non trovato" };

    const notes = (snap.data()!["additionalNotes"] ?? []) as Array<{ id: string; text: string; createdAt: string }>;
    const updated = notes.filter((n) => n.id !== noteId);

    await docRef.update({
      additionalNotes: updated,
      updatedAt: FieldValue.serverTimestamp(),
    });

    revalidatePath(`/samples/${sampleId}`);
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore eliminazione nota campione", err);
    return { success: false, error: "Errore durante l'eliminazione. Riprova." };
  }
}
