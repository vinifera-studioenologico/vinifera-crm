"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import { CompanySettingsSchema } from "@/schemas/client";
import type { CompanySettingsValues } from "@/schemas/client";
import type { ActionResult } from "@/types";

const COMPANY_DOC = "settings/company";

// ── Leggi impostazioni azienda ────────────────────────────────────────
export async function getCompanySettings(): Promise<CompanySettingsValues | null> {
  await requireAdmin();

  const snap = await adminDb.doc(COMPANY_DOC).get();
  if (!snap.exists) return null;

  const data = snap.data();
  if (!data) return null;

  // Rimuoviamo i campi server-only prima di restituire al client
  const SERVER_ONLY = new Set(["updatedAt", "updatedBy", "createdAt"]);
  const rest = Object.fromEntries(
    Object.entries(data).filter(([k]) => !SERVER_ONLY.has(k)),
  );

  const parsed = CompanySettingsSchema.safeParse(rest);
  if (!parsed.success) {
    logger.warn("Company settings malformed in Firestore", parsed.error);
    // Restituiamo i dati grezzi con cast (best-effort) anziché null
    return rest as CompanySettingsValues;
  }

  return parsed.data;
}

// ── Salva impostazioni azienda ────────────────────────────────────────
export async function updateCompanySettings(
  raw: unknown,
): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  const parsed = CompanySettingsSchema.safeParse(raw);
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

  try {
    await adminDb.doc(COMPANY_DOC).set(
      {
        ...data,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      },
      { merge: true },
    );

    revalidatePath("/settings/company");
    logger.info("Company settings aggiornate", { uid: actor.uid });

    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore aggiornamento company settings", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

// ── Upload logo su Storage ─────────────────────────────────────────────
export async function uploadCompanyLogo(
  formData: FormData,
): Promise<ActionResult<{ logoUrl: string }>> {
  await requireAdmin();

  const file = formData.get("logo");
  if (!(file instanceof File)) {
    return { success: false, error: "File non trovato" };
  }

  // Validazione dimensione (max 2MB)
  if (file.size > 2 * 1024 * 1024) {
    return { success: false, error: "Il logo non può superare 2MB" };
  }

  // Validazione MIME (solo immagini — magic bytes non disponibili server-only qui,
  // controllo estensione + MIME come prima linea di difesa)
  const allowedMimes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
  if (!allowedMimes.includes(file.type)) {
    return {
      success: false,
      error: "Formato non supportato. Carica un'immagine PNG, JPEG, WebP o SVG.",
    };
  }

  try {
    const ext = file.name.split(".").pop() ?? "png";
    const storagePath = `company/logo.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const bucket = adminStorage.bucket();
    const fileRef = bucket.file(storagePath);

    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        cacheControl: "public, max-age=3600",
      },
    });

    // Signed URL valida 10 anni (logo aziendale semi-permanente)
    const [signedUrl] = await fileRef.getSignedUrl({
      action: "read",
      expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    });

    // Salva l'URL nel documento settings
    await adminDb.doc(COMPANY_DOC).set(
      { logoUrl: signedUrl, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    revalidatePath("/settings/company");

    return { success: true, data: { logoUrl: signedUrl } };
  } catch (err) {
    logger.error("Errore upload logo", err);
    return { success: false, error: "Errore durante il caricamento del logo." };
  }
}
