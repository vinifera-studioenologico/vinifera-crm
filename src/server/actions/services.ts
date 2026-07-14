"use server";

import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import { ServiceFormSchema } from "@/schemas/service";
import type { ServiceDoc } from "@/schemas/service";
import type { ActionResult } from "@/types";
import { toServiceDoc } from "@/server/public/services";
import { triggerSiteRevalidation } from "@/server/site-revalidation";

const COL = "services";

// ── Lista servizi ─────────────────────────────────────────────────────
export async function getServices(
  opts: { includeArchived?: boolean } = {},
): Promise<ServiceDoc[]> {
  await requireAdmin();

  let query = adminDb.collection(COL).orderBy("order");
  if (!opts.includeArchived) {
    query = query.where("deletedAt", "==", null) as typeof query;
  }

  const snap = await query.get();
  return snap.docs.map((d) => toServiceDoc(d.id, d.data()));
}

// ── Singolo servizio ──────────────────────────────────────────────────
export async function getService(id: string): Promise<ServiceDoc | null> {
  await requireAdmin();

  const snap = await adminDb.collection(COL).doc(id).get();
  if (!snap.exists) return null;
  return toServiceDoc(snap.id, snap.data()!);
}

// ── Crea servizio ─────────────────────────────────────────────────────
export async function createService(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const actor = await requireAdmin();

  const parsed = ServiceFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path]!.push(issue.message);
    }
    return { success: false, error: "Dati non validi", fieldErrors };
  }

  try {
    // Unicità slug tra servizi non archiviati
    const slugConflict = await adminDb
      .collection(COL)
      .where("slug", "==", parsed.data.slug)
      .where("deletedAt", "==", null)
      .limit(1)
      .get();

    if (!slugConflict.empty) {
      return {
        success: false,
        error: "Slug già in uso",
        fieldErrors: { slug: ["Questo slug è già utilizzato da un altro servizio attivo"] },
      };
    }

    // Costruire il doc senza campi undefined
    const doc: Record<string, unknown> = {
      slug: parsed.data.slug,
      order: parsed.data.order,
      inEvidenza: parsed.data.inEvidenza,
      available: parsed.data.available,
      title: parsed.data.title,
      summary: parsed.data.summary,
      description: parsed.data.description,
      benefits: parsed.data.benefits,
      faq: parsed.data.faq,
      imageUrl: parsed.data.imageUrl,
      images: parsed.data.images,
      version: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deletedAt: null,
      createdBy: actor.uid,
    };
    if (parsed.data.basePrice !== null) doc["basePrice"] = parsed.data.basePrice;
    else doc["basePrice"] = null;
    if (parsed.data.discountedPrice !== null) doc["discountedPrice"] = parsed.data.discountedPrice;
    else doc["discountedPrice"] = null;
    if (parsed.data.priceLabel !== null) doc["priceLabel"] = parsed.data.priceLabel;
    else doc["priceLabel"] = null;

    const docRef = adminDb.collection(COL).doc();
    await docRef.set(doc);

    revalidatePath("/servizi");
    revalidatePath(`/servizi/${parsed.data.slug}`);
    triggerSiteRevalidation("services");
    logger.info("Servizio creato", { id: docRef.id, slug: parsed.data.slug });
    return { success: true, data: { id: docRef.id } };
  } catch (err) {
    logger.error("Errore creazione servizio", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

// ── Aggiorna servizio ─────────────────────────────────────────────────
export async function updateService(
  id: string,
  raw: unknown,
  expectedVersion: number,
): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  const parsed = ServiceFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path]!.push(issue.message);
    }
    return { success: false, error: "Dati non validi", fieldErrors };
  }

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const docRef = adminDb.collection(COL).doc(id);
      const snap = await tx.get(docRef);

      if (!snap.exists) return "not_found";

      const current = snap.data()!;

      // OCC
      if (current["version"] !== expectedVersion) return "conflict";

      // Unicità slug (escludi il doc corrente)
      const slugConflictSnap = await tx.get(
        adminDb
          .collection(COL)
          .where("slug", "==", parsed.data.slug)
          .where("deletedAt", "==", null)
          .limit(1) as FirebaseFirestore.Query,
      );
      if (!slugConflictSnap.empty && slugConflictSnap.docs[0]!.id !== id) {
        return "slug_conflict";
      }

      const updateDoc: Record<string, unknown> = {
        slug: parsed.data.slug,
        order: parsed.data.order,
        inEvidenza: parsed.data.inEvidenza,
        available: parsed.data.available,
        title: parsed.data.title,
        summary: parsed.data.summary,
        description: parsed.data.description,
        benefits: parsed.data.benefits,
        faq: parsed.data.faq,
        imageUrl: parsed.data.imageUrl,
        images: parsed.data.images,
        basePrice: parsed.data.basePrice,
        discountedPrice: parsed.data.discountedPrice,
        priceLabel: parsed.data.priceLabel,
        version: expectedVersion + 1,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      };

      tx.update(docRef, updateDoc);
      return "ok";
    });

    if (result === "not_found") return { success: false, error: "Servizio non trovato" };
    if (result === "conflict")
      return {
        success: false,
        error: "Il documento è stato modificato da un'altra sessione. Ricarica la pagina.",
      };
    if (result === "slug_conflict")
      return {
        success: false,
        error: "Slug già in uso",
        fieldErrors: { slug: ["Questo slug è già utilizzato da un altro servizio attivo"] },
      };

    revalidatePath("/servizi");
    revalidatePath(`/servizi/${parsed.data.slug}`);
    triggerSiteRevalidation("services");
    logger.info("Servizio aggiornato", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore aggiornamento servizio", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

// ── Archivia servizio (soft delete) ───────────────────────────────────
export async function archiveService(id: string): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    await adminDb.collection(COL).doc(id).update({
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });

    revalidatePath("/servizi");
    triggerSiteRevalidation("services");
    logger.info("Servizio archiviato", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore archiviazione servizio", err);
    return { success: false, error: "Errore durante l'archiviazione. Riprova." };
  }
}

// ── Ripristina servizio archiviato ────────────────────────────────────
export async function restoreService(id: string): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    await adminDb.collection(COL).doc(id).update({
      deletedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });

    revalidatePath("/servizi");
    triggerSiteRevalidation("services");
    logger.info("Servizio ripristinato", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore ripristino servizio", err);
    return { success: false, error: "Errore durante il ripristino. Riprova." };
  }
}

// ── Upload immagine servizio su Storage ───────────────────────────────
export async function uploadServiceImage(
  serviceId: string,
  formData: FormData,
  slot: string,
): Promise<ActionResult<{ url: string }>> {
  await requireAdmin();

  const file = formData.get("image");
  if (!(file instanceof File)) {
    return { success: false, error: "File non trovato" };
  }

  if (file.size > 5 * 1024 * 1024) {
    return { success: false, error: "L'immagine non può superare 5MB" };
  }

  const allowedMimes = ["image/png", "image/jpeg", "image/webp"];
  if (!allowedMimes.includes(file.type)) {
    return {
      success: false,
      error: "Formato non supportato. Carica un'immagine PNG, JPEG o WebP.",
    };
  }

  try {
    const ext = file.name.split(".").pop() ?? "jpg";
    const storagePath = `services/${serviceId}/${slot}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const bucket = adminStorage.bucket();
    const fileRef = bucket.file(storagePath);

    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        cacheControl: "public, max-age=31536000",
      },
    });

    const [signedUrl] = await fileRef.getSignedUrl({
      action: "read",
      expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    });

    return { success: true, data: { url: signedUrl } };
  } catch (err) {
    logger.error("Errore upload immagine servizio", err);
    return { success: false, error: "Errore durante il caricamento. Riprova." };
  }
}

// ── Cancella immagine servizio da Storage ──────────────────────────────
export async function deleteServiceImage(
  serviceId: string,
  slot: string,
): Promise<ActionResult<void>> {
  await requireAdmin();

  try {
    const bucket = adminStorage.bucket();
    const [files] = await bucket.getFiles({
      prefix: `services/${serviceId}/${slot}.`,
    });
    for (const f of files) {
      await f.delete().catch(() => null);
    }
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore cancellazione immagine servizio", err);
    return { success: false, error: "Errore durante la cancellazione." };
  }
}

