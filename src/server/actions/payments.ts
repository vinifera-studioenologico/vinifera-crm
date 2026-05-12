"use server";

import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import { PaymentFormSchema, MarkInstallmentPaidSchema } from "@/schemas/payment";
import type { PaymentDoc, InstallmentDoc } from "@/schemas/payment";
import type { ActionResult, PaginatedResult } from "@/types";
import { generateDueDates } from "@/lib/utils/date";
import { splitInCents } from "@/lib/utils/money";

const COL = "payments";
const PAGE_SIZE = 25;

// ── Conversioni Firestore ─────────────────────────────────────────────
function toPaymentDoc(id: string, data: FirebaseFirestore.DocumentData): PaymentDoc {
  return {
    id,
    clientId: data["clientId"] ?? "",
    source: data["source"] ?? { kind: "manual" },
    description: data["description"] ?? "",
    totalAmountCents: data["totalAmountCents"] ?? 0,
    paidAmountCents: data["paidAmountCents"] ?? 0,
    status: data["status"] ?? "pending",
    installmentsCount: data["installmentsCount"] ?? 1,
    version: data["version"] ?? 0,
    createdAt: data["createdAt"],
    updatedAt: data["updatedAt"],
    deletedAt: data["deletedAt"] ?? null,
  };
}

function toInstallmentDoc(
  id: string,
  data: FirebaseFirestore.DocumentData,
): InstallmentDoc {
  return {
    id,
    index: data["index"] ?? 0,
    // handle both field name conventions (createSample wrote "dueAt")
    dueDate: data["dueAt"] ?? data["dueDate"],
    amountCents: data["amountCents"] ?? 0,
    status: data["status"] ?? "pending",
    paidAt: data["paidAt"],
    paidAmountCents: data["paidAmountCents"],
    method: data["method"],
    note: data["note"],
    createdAt: data["createdAt"],
    updatedAt: data["updatedAt"],
  };
}

// ── Lista pagamenti ───────────────────────────────────────────────────
export async function getPayments(
  opts: { clientId?: string; cursor?: string } = {},
): Promise<PaginatedResult<PaymentDoc>> {
  await requireAdmin();

  let query = adminDb.collection(COL).orderBy("createdAt", "desc");

  if (opts.clientId) {
    query = query.where("clientId", "==", opts.clientId) as typeof query;
  }

  if (opts.cursor) {
    const cursorDoc = await adminDb.collection(COL).doc(opts.cursor).get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc) as typeof query;
    }
  }

  const snap = await query.limit(PAGE_SIZE + 1).get();
  const docs = snap.docs.map((d) => toPaymentDoc(d.id, d.data()));
  const hasMore = docs.length > PAGE_SIZE;
  const items = hasMore ? docs.slice(0, PAGE_SIZE) : docs;

  return {
    items,
    nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    hasMore,
  };
}

// ── Rate di un pagamento ──────────────────────────────────────────────
export async function getPaymentInstallments(
  paymentId: string,
): Promise<InstallmentDoc[]> {
  await requireAdmin();

  const snap = await adminDb
    .collection(COL)
    .doc(paymentId)
    .collection("installments")
    .orderBy("index", "asc")
    .get();

  return snap.docs.map((d) => toInstallmentDoc(d.id, d.data()));
}

// ── Registra incasso rata ─────────────────────────────────────────────
export async function markInstallmentPaid(
  raw: unknown,
): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  const parsed = MarkInstallmentPaidSchema.safeParse(raw);
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
  // paidAmountCents è già in centesimi grazie a zEurInput transform
  const paidAmountCents = data.paidAmountCents as number;

  try {
    await adminDb.runTransaction(async (tx) => {
      const installRef = adminDb
        .collection(COL)
        .doc(data.paymentId)
        .collection("installments")
        .doc(data.installmentId);

      const paymentRef = adminDb.collection(COL).doc(data.paymentId);

      const [installSnap, paymentSnap] = await Promise.all([
        tx.get(installRef),
        tx.get(paymentRef),
      ]);

      if (!installSnap.exists) throw new Error("Rata non trovata");
      if (!paymentSnap.exists) throw new Error("Pagamento non trovato");

      const installData = installSnap.data()!;
      const paymentData = paymentSnap.data()!;

      if (installData["status"] === "paid") throw new Error("Rata già pagata");
      if (installData["status"] === "cancelled") throw new Error("Rata annullata");

      const currentPaid = (paymentData["paidAmountCents"] as number) ?? 0;
      const totalAmount = (paymentData["totalAmountCents"] as number) ?? 0;
      const newPaid = currentPaid + paidAmountCents;
      const newStatus = newPaid >= totalAmount ? "paid" : "partial";

      const paidAtTs = Timestamp.fromDate(
        new Date(data.paidAt + "T12:00:00"),
      );

      // Aggiorna rata
      tx.update(installRef, {
        status: "paid",
        paidAt: paidAtTs,
        paidAmountCents,
        method: data.method,
        note: data.note ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Aggiorna pagamento
      tx.update(paymentRef, {
        paidAmountCents: FieldValue.increment(paidAmountCents),
        status: newStatus,
        version: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Log transazione immutabile
      const txLogRef = adminDb
        .collection(COL)
        .doc(data.paymentId)
        .collection("transactions")
        .doc();
      tx.set(txLogRef, {
        installmentId: data.installmentId,
        type: "payment",
        amountCents: paidAmountCents,
        date: paidAtTs,
        method: data.method,
        note: data.note ?? null,
        performedBy: actor.uid,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Aggiorna stats cliente
      const clientId = paymentData["clientId"] as string;
      if (clientId) {
        const clientRef = adminDb.collection("clients").doc(clientId);
        tx.update(clientRef, {
          "stats.pendingAmountCents": FieldValue.increment(-paidAmountCents),
          "stats.totalRevenueCents": FieldValue.increment(paidAmountCents),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    revalidatePath("/payments");
    revalidatePath("/clients");
    return { success: true, data: undefined };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Errore durante la registrazione";
    logger.error("markInstallmentPaid failed", { err });
    return { success: false, error: message };
  }
}

// ── Annulla pagamento ─────────────────────────────────────────────────
export async function cancelPayment(id: string): Promise<ActionResult<void>> {
  await requireAdmin();

  try {
    const ref = adminDb.collection(COL).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, error: "Pagamento non trovato" };

    const data = snap.data()!;
    if (data["status"] === "paid") {
      return { success: false, error: "Il pagamento è già completato" };
    }
    if (data["status"] === "cancelled") {
      return { success: false, error: "Il pagamento è già annullato" };
    }

    // Annulla rate pendenti + pagamento
    const installmentsSnap = await adminDb
      .collection(COL)
      .doc(id)
      .collection("installments")
      .where("status", "in", ["pending", "overdue"])
      .get();

    const batch = adminDb.batch();
    batch.update(ref, {
      status: "cancelled",
      updatedAt: FieldValue.serverTimestamp(),
    });
    for (const installDoc of installmentsSnap.docs) {
      batch.update(installDoc.ref, {
        status: "cancelled",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    revalidatePath("/payments");
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("cancelPayment failed", { err });
    return { success: false, error: "Errore durante l'annullamento" };
  }
}

// ── Crea pagamento manuale ────────────────────────────────────────────
export async function createManualPayment(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requireAdmin();

  const parsed = PaymentFormSchema.safeParse(raw);
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
  const totalAmountCents = data.totalAmountCents as number;

  try {
    let createdId = "";

    await adminDb.runTransaction(async (tx) => {
      const paymentRef = adminDb.collection(COL).doc();
      createdId = paymentRef.id;

      tx.set(paymentRef, {
        clientId: data.clientId,
        source: { kind: "manual" },
        description: data.description,
        totalAmountCents,
        paidAmountCents: 0,
        status: "pending",
        installmentsCount: data.installmentsCount,
        notes: data.notes ?? null,
        version: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: actor.uid,
      });

      const amounts = splitInCents(totalAmountCents, data.installmentsCount);
      const dueDates = generateDueDates(
        data.firstDueDate,
        data.installmentsCount,
        data.installmentPeriod,
      );

      for (let i = 0; i < data.installmentsCount; i++) {
        const installRef = adminDb
          .collection(COL)
          .doc(paymentRef.id)
          .collection("installments")
          .doc();
        tx.set(installRef, {
          index: i + 1,
          amountCents: amounts[i] ?? 0,
          paidAmountCents: 0,
          dueAt: Timestamp.fromDate(
            new Date((dueDates[i] ?? data.firstDueDate) + "T23:59:59"),
          ),
          status: "pending",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // Aggiorna stats cliente
      const clientRef = adminDb.collection("clients").doc(data.clientId);
      tx.update(clientRef, {
        "stats.pendingAmountCents": FieldValue.increment(totalAmountCents),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    revalidatePath(`/clients/${data.clientId}/payments`);
    revalidatePath("/payments");
    return { success: true, data: { id: createdId } };
  } catch (err) {
    logger.error("createManualPayment failed", { err });
    return { success: false, error: "Errore durante la creazione del pagamento" };
  }
}
