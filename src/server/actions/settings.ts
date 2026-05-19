"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import { buildEmailHtml } from "@/lib/email";
import { CompanySettingsSchema } from "@/schemas/client";
import type { CompanySettingsValues } from "@/schemas/client";
import { NotificationSettingsSchema } from "@/schemas/settings";
import type { NotificationSettingsValues } from "@/schemas/settings";
import type { ActionResult } from "@/types";

const COMPANY_DOC = "settings/company";
const NOTIFICATIONS_DOC = "settings/notifications";

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

// ── Leggi impostazioni notifiche ─────────────────────────────────────
export async function getNotificationSettings(): Promise<NotificationSettingsValues> {
  await requireAdmin();

  const snap = await adminDb.doc(NOTIFICATIONS_DOC).get();
  if (!snap.exists) {
    return NotificationSettingsSchema.parse({});
  }

  const parsed = NotificationSettingsSchema.safeParse(snap.data() ?? {});
  if (!parsed.success) {
    logger.warn("Notification settings malformed in Firestore", parsed.error);
    return NotificationSettingsSchema.parse({});
  }

  return parsed.data;
}

// ── Salva impostazioni notifiche ──────────────────────────────────────
export async function updateNotificationSettings(
  raw: unknown,
): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  const parsed = NotificationSettingsSchema.safeParse(raw);
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
    await adminDb.doc(NOTIFICATIONS_DOC).set(
      {
        ...parsed.data,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      },
      { merge: true },
    );

    revalidatePath("/settings/notifications");
    logger.info("Notification settings aggiornate", { uid: actor.uid });

    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore aggiornamento notification settings", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

// ── Leggi config notifiche da Firestore (uso interno) ─────────────────
async function loadNotificationConfig(): Promise<NotificationSettingsValues> {
  const snap = await adminDb.doc(NOTIFICATIONS_DOC).get();
  const parsed = NotificationSettingsSchema.safeParse(snap.data() ?? {});
  return parsed.success ? parsed.data : NotificationSettingsSchema.parse({});
}

// ── Test notifica Telegram ────────────────────────────────────────────
export async function sendTestTelegram(): Promise<ActionResult<void>> {
  await requireAdmin();

  const config = await loadNotificationConfig();
  const token = config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = config.telegramChatId || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return {
      success: false,
      error: "Bot Token e Chat ID non configurati. Compila i campi e salva prima di testare.",
    };
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "🔔 <b>Test notifica Vinifera</b>\nLe notifiche Telegram sono configurate correttamente.",
          parse_mode: "HTML",
        }),
      },
    );

    if (!res.ok) {
      const data = (await res.json()) as { description?: string };
      return {
        success: false,
        error: `Telegram ha risposto con errore: ${data.description ?? "risposta non valida"}`,
      };
    }

    return { success: true, data: undefined };
  } catch (err) {
    logger.error("sendTestTelegram failed", err);
    return {
      success: false,
      error: "Errore di rete. Controlla token e chat ID.",
    };
  }
}

// ── Test notifica Email ───────────────────────────────────────────────
export async function sendTestEmail(): Promise<ActionResult<void>> {
  await requireAdmin();

  const config = await loadNotificationConfig();
  const to = config.notifyEmail || process.env.NOTIFY_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;

  if (!to) {
    return {
      success: false,
      error: "Email notifiche non configurata. Compila il campo e salva prima di testare.",
    };
  }

  if (!apiKey) {
    return {
      success: false,
      error: "RESEND_API_KEY non configurata nelle variabili d'ambiente.",
    };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "noreply@vinifera.app",
      to,
      subject: "Test notifica Vinifera",
      text: "Le notifiche email sono configurate correttamente. Questo è un messaggio di test inviato da Vinifera CRM.",
      html: buildEmailHtml({
        title: "Test notifica",
        body: "<p>Le notifiche email sono configurate correttamente.</p><p>Questo è un messaggio di test inviato da <strong>Vinifera CRM</strong>.</p>",
      }),
    });

    if (error) {
      return { success: false, error: `Resend: ${error.message}` };
    }

    return { success: true, data: undefined };
  } catch (err) {
    logger.error("sendTestEmail failed", err);
    return {
      success: false,
      error: "Errore di rete. Controlla la configurazione Resend.",
    };
  }
}
