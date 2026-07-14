"use server";

import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import type { ActionResult } from "@/types";

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
