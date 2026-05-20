"use server";

import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import { ClientPackageFormSchema } from "@/schemas/package";
import type { ClientPackageDoc } from "@/schemas/package";
import { tsToISO } from "@/lib/utils/date";
import type { ActionResult } from "@/types";
import { generateDueDates } from "@/lib/utils/date";
import { splitInCents } from "@/lib/utils/money";
import { getClient } from "./clients";

const COL = "clientPackages";

// ── Converti documento Firestore ──────────────────────────────────────
function toClientPackageDoc(
  id: string,
  data: FirebaseFirestore.DocumentData,
): ClientPackageDoc {
  return {
    id,
    clientId: data["clientId"] ?? "",
    packageId: data["packageId"] ?? "",
    packageNameSnapshot: data["packageNameSnapshot"] ?? "",
    totalAnalyses: data["totalAnalyses"] ?? 0,
    remainingAnalyses: data["remainingAnalyses"] ?? 0,
    priceCents: data["priceCents"] ?? 0,
    status: data["status"] ?? "active",
    paymentId: data["paymentId"],
    purchasedAt: tsToISO(data["purchasedAt"]),
    cancelledAt: tsToISO(data["cancelledAt"]),
    cancelReason: data["cancelReason"],
    createdAt: tsToISO(data["createdAt"]),
    updatedAt: tsToISO(data["updatedAt"]),
  };
}

// ── Lista pacchetti di un cliente ─────────────────────────────────────
export async function getClientPackages(clientId: string): Promise<ClientPackageDoc[]> {
  await requireAdmin();

  const snap = await adminDb
    .collection(COL)
    .where("clientId", "==", clientId)
    .orderBy("purchasedAt", "desc")
    .get();

  return snap.docs.map((d) => toClientPackageDoc(d.id, d.data()));
}

// ── Singolo pacchetto cliente ─────────────────────────────────────────
export async function getClientPackage(id: string): Promise<ClientPackageDoc | null> {
  await requireAdmin();
  const doc = await adminDb.collection(COL).doc(id).get();
  if (!doc.exists) return null;
  return toClientPackageDoc(doc.id, doc.data()!);
}

// ── Acquisto pacchetto ────────────────────────────────────────────────
export async function purchasePackage(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requireAdmin();

  const parsed = ClientPackageFormSchema.safeParse(raw);
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
  // priceCents è già in centesimi grazie a zEurInput transform
  const priceCents = data.priceCents as number;

  const client = await getClient(data.clientId);
  if (!client) return { success: false, error: "Cliente non trovato" };

  // Verifica che il pacchetto template esista
  const pkgTemplateSnap = await adminDb
    .collection("packages")
    .doc(data.packageId)
    .get();
  if (!pkgTemplateSnap.exists) return { success: false, error: "Pacchetto non trovato" };

  try {
    let createdId = "";

    await adminDb.runTransaction(async (tx) => {
      const cpRef = adminDb.collection(COL).doc();
      createdId = cpRef.id;

      // 1. Crea clientPackage
      tx.set(cpRef, {
        clientId: data.clientId,
        packageId: data.packageId,
        packageNameSnapshot: data.packageNameSnapshot,
        totalAnalyses: data.totalAnalyses,
        remainingAnalyses: data.totalAnalyses,
        priceCents,
        status: "active",
        purchasedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: actor.uid,
      });

      // 2. Crea pagamento con rate (opzionale)
      if (data.createPayment && priceCents > 0) {
        const count = data.installmentsCount ?? 1;
        const firstDue = data.firstDueDate ?? new Date().toISOString().slice(0, 10);
        const period = data.installmentPeriod ?? "monthly";

        const paymentRef = adminDb.collection("payments").doc();
        tx.set(paymentRef, {
          clientId: data.clientId,
          source: { kind: "package", refId: cpRef.id },
          description: `Pacchetto ${data.packageNameSnapshot} – ${client.displayName}`,
          totalAmountCents: priceCents,
          paidAmountCents: 0,
          status: "pending",
          installmentsCount: count,
          version: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          createdBy: actor.uid,
        });

        // Collega payment al clientPackage
        tx.update(cpRef, { paymentId: paymentRef.id });

        // Genera rate
        const amounts = splitInCents(priceCents, count);
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

        // Aggiorna stats cliente
        const clientRef = adminDb.collection("clients").doc(data.clientId);
        tx.update(clientRef, {
          "stats.pendingAmountCents": FieldValue.increment(priceCents),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    revalidatePath(`/clients/${data.clientId}/packages`);
    return { success: true, data: { id: createdId } };
  } catch (err) {
    logger.error("purchasePackage failed", { err });
    return { success: false, error: "Errore durante l'acquisto del pacchetto" };
  }
}

// ── Annulla pacchetto cliente ─────────────────────────────────────────
export async function cancelClientPackage(
  id: string,
  reason?: string,
): Promise<ActionResult<void>> {
  await requireAdmin();

  try {
    const ref = adminDb.collection(COL).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, error: "Pacchetto non trovato" };

    const data = snap.data()!;
    if (data["status"] === "cancelled") {
      return { success: false, error: "Il pacchetto è già annullato" };
    }

    await ref.update({
      status: "cancelled",
      cancelledAt: FieldValue.serverTimestamp(),
      cancelReason: reason ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    revalidatePath(`/clients/${data["clientId"] as string}/packages`);
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("cancelClientPackage failed", { err });
    return { success: false, error: "Errore durante l'annullamento" };
  }
}
