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
import { computeSampleTotal } from "@/lib/calc/sample";
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

        const paymentRef = adminDb.collection("payments").doc();
        tx.set(paymentRef, {
          clientId: data.clientId,
          source: { kind: "sample", refId: sampleRef.id, sampleCode: code },
          description: data.sampleName,
          totalAmountCents: estimatedTotalCents,
          paidAmountCents: 0,
          status: "pending",
          installmentsCount: count,
          version: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          createdBy: actor.uid,
        });

        // Collega il payment al campione
        tx.update(sampleRef, { paymentId: paymentRef.id });

        // Genera rate
        const amounts = splitInCents(estimatedTotalCents, count);
        const dueDates = generateDueDates(firstDue, count, period);

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

        // Aggiorna stats cliente
        const clientRef = adminDb.collection("clients").doc(data.clientId);
        tx.update(clientRef, {
          "stats.pendingAmountCents": FieldValue.increment(estimatedTotalCents),
          "stats.samplesPending": FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
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
