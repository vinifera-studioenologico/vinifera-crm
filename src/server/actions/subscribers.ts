"use server";

import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import { tsToISO } from "@/lib/utils/date";
import type { ActionResult } from "@/types";

// ── Tipo iscritto serializzabile per i Client Components ──────────────────────
export interface SubscriberRow {
  id: string;
  email: string;
  emailNormalized: string;
  status: "pending" | "active" | "unsubscribed";
  locale: "it" | "en";
  createdAt: string | undefined;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
}

/** Lista iscritti ordinati per data decrescente */
export async function getEventSubscribers(): Promise<SubscriberRow[]> {
  await requireAdmin();

  const snap = await adminDb
    .collection("eventSubscribers")
    .orderBy("createdAt", "desc")
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      email: data["email"] ?? "",
      emailNormalized: data["emailNormalized"] ?? "",
      status: data["status"] ?? "pending",
      locale: data["locale"] ?? "it",
      createdAt: tsToISO(data["createdAt"]),
      confirmedAt: tsToISO(data["confirmedAt"]) ?? null,
      unsubscribedAt: tsToISO(data["unsubscribedAt"]) ?? null,
    };
  });
}

/** Rimozione manuale iscritto (GDPR) — soft unsubscribe */
export async function unsubscribeSubscriber(id: string): Promise<ActionResult<void>> {
  await requireAdmin();

  try {
    await adminDb.collection("eventSubscribers").doc(id).update({
      status: "unsubscribed",
      unsubscribedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    logger.info("Iscritto rimosso manualmente", { id });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore rimozione iscritto", { id, err });
    return { success: false, error: "Errore durante la rimozione. Riprova." };
  }
}
