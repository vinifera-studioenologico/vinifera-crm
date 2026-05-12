"use server";

import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import { PackageFormSchema } from "@/schemas/package";
import type { PackageDoc } from "@/schemas/package";
import type { ActionResult } from "@/types";

const COL = "packages";

function toPackageDoc(id: string, data: FirebaseFirestore.DocumentData): PackageDoc {
  return {
    id,
    name: data["name"] ?? "",
    description: data["description"],
    totalAnalyses: data["totalAnalyses"] ?? 0,
    priceCents: data["priceCents"] ?? 0,
    active: data["active"] ?? true,
    version: data["version"] ?? 0,
    createdAt: data["createdAt"],
    updatedAt: data["updatedAt"],
    deletedAt: data["deletedAt"] ?? null,
  };
}

// ── Lista pacchetti ───────────────────────────────────────────────────
export async function getPackages(
  opts: { includeArchived?: boolean } = {},
): Promise<PackageDoc[]> {
  await requireAdmin();

  let query = adminDb.collection(COL).orderBy("name");
  if (!opts.includeArchived) {
    query = query.where("deletedAt", "==", null) as typeof query;
  }

  const snap = await query.get();
  return snap.docs.map((d) => toPackageDoc(d.id, d.data()));
}

// ── Crea pacchetto ────────────────────────────────────────────────────
export async function createPackage(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const actor = await requireAdmin();

  const parsed = PackageFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path]!.push(issue.message);
    }
    return { success: false, error: "Dati non validi", fieldErrors };
  }

  const { priceCents, ...rest } = parsed.data;

  try {
    const docRef = adminDb.collection(COL).doc();
    await docRef.set({
      ...rest,
      priceCents,
      version: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deletedAt: null,
      createdBy: actor.uid,
    });

    revalidatePath("/packages");
    logger.info("Pacchetto creato", { id: docRef.id, name: rest.name });
    return { success: true, data: { id: docRef.id } };
  } catch (err) {
    logger.error("Errore creazione pacchetto", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

// ── Aggiorna pacchetto ────────────────────────────────────────────────
export async function updatePackage(
  id: string,
  raw: unknown,
  expectedVersion: number,
): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  const parsed = PackageFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path]!.push(issue.message);
    }
    return { success: false, error: "Dati non validi", fieldErrors };
  }

  const { priceCents, ...rest } = parsed.data;

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const docRef = adminDb.collection(COL).doc(id);
      const snap = await tx.get(docRef);

      if (!snap.exists) return "not_found";
      if (snap.data()!["version"] !== expectedVersion) return "conflict";

      tx.update(docRef, {
        ...rest,
        priceCents,
        version: expectedVersion + 1,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });

      return "ok";
    });

    if (result === "not_found") return { success: false, error: "Pacchetto non trovato" };
    if (result === "conflict") return { success: false, error: "Il documento è stato modificato da un'altra sessione. Ricarica la pagina." };

    revalidatePath("/packages");
    logger.info("Pacchetto aggiornato", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore aggiornamento pacchetto", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

// ── Archivia pacchetto ────────────────────────────────────────────────
export async function archivePackage(id: string): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    await adminDb.collection(COL).doc(id).update({
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });

    revalidatePath("/packages");
    logger.info("Pacchetto archiviato", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore archiviazione pacchetto", err);
    return { success: false, error: "Errore durante l'archiviazione. Riprova." };
  }
}

// ── Ripristina pacchetto ──────────────────────────────────────────────
export async function restorePackage(id: string): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    await adminDb.collection(COL).doc(id).update({
      deletedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });

    revalidatePath("/packages");
    logger.info("Pacchetto ripristinato", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore ripristino pacchetto", err);
    return { success: false, error: "Errore durante il ripristino. Riprova." };
  }
}
