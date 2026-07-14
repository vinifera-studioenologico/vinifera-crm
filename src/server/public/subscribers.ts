import "server-only";

import { randomBytes } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { buildEmailHtml } from "@/lib/email";
import { normalizeEmail } from "@/lib/events/normalize";
import { checkRateLimit } from "@/server/public/rate-limit";
import { IncomingSubscribeSchema } from "@/schemas/eventSubscriber";
import { decideSubscribeAction } from "@/server/public/subscriber-logic";
import { logger } from "@/lib/logger";

const COL = "eventSubscribers";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.viniferastudioenologico.it";

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

// ── Subscribe ─────────────────────────────────────────────────────────
export async function handleSubscribe(
  rawBody: unknown,
  ip: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const parsed = IncomingSubscribeSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: { error: "Dati non validi" } };
  }

  const { email, locale, consent, website } = parsed.data;

  if (consent !== true) {
    return { status: 400, body: { error: "Il consenso è obbligatorio." } };
  }

  // Honeypot
  if (website && website.trim() !== "") {
    return { status: 200, body: { ok: true } };
  }

  // Rate limit IP
  const ipAllowed = await checkRateLimit("subscribe-ip", ip);
  if (!ipAllowed) {
    return { status: 429, body: { error: "Troppe richieste. Riprova tra qualche ora." } };
  }

  const emailNorm = normalizeEmail(email);

  // Cerca iscritto esistente
  const existing = await adminDb
    .collection(COL)
    .where("emailNormalized", "==", emailNorm)
    .limit(1)
    .get();

  const existingDoc = existing.empty ? null : existing.docs[0]!;
  const existingStatus = existingDoc?.data()?.["status"] ?? null;

  const decision = decideSubscribeAction(existingStatus as "pending" | "active" | "unsubscribed" | null);

  if (decision.action === "noop_already_active") {
    // Idempotente: già attivo
    return { status: 200, body: { ok: true } };
  }

  const confirmToken = generateToken();
  const unsubscribeToken = generateToken();

  if (decision.action === "create_new") {
    await adminDb.collection(COL).add({
      email,
      emailNormalized: emailNorm,
      status: "pending",
      locale,
      confirmToken,
      unsubscribeToken,
      consentAt: FieldValue.serverTimestamp(),
      confirmedAt: null,
      unsubscribedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else if (decision.action === "resend_confirm") {
    // Aggiorna token (rigenera) e reinvia
    await existingDoc!.ref.update({
      confirmToken,
      locale,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else if (decision.action === "re_subscribe") {
    // Ripristina a pending con nuovi token
    await existingDoc!.ref.update({
      status: "pending",
      locale,
      confirmToken,
      unsubscribeToken,
      consentAt: FieldValue.serverTimestamp(),
      confirmedAt: null,
      unsubscribedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  // Invia email double opt-in
  await sendConfirmEmail(email, emailNorm, locale, confirmToken).catch((err) =>
    logger.error("[Subscribers] Errore invio email conferma", err),
  );

  return { status: 200, body: { ok: true } };
}

// ── Confirm ───────────────────────────────────────────────────────────
export async function handleConfirm(
  token: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const snap = await adminDb
    .collection(COL)
    .where("confirmToken", "==", token)
    .limit(1)
    .get();

  if (snap.empty) {
    return { status: 404, body: { error: "Token non trovato o già usato." } };
  }

  const doc = snap.docs[0]!;
  if (doc.data()["status"] !== "pending") {
    // Già attivo o disiscritto — idempotente
    return { status: 200, body: { ok: true } };
  }

  await doc.ref.update({
    status: "active",
    confirmedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { status: 200, body: { ok: true } };
}

// ── Unsubscribe ───────────────────────────────────────────────────────
export async function handleUnsubscribe(
  token: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const snap = await adminDb
    .collection(COL)
    .where("unsubscribeToken", "==", token)
    .limit(1)
    .get();

  if (snap.empty) {
    return { status: 404, body: { error: "Token non trovato." } };
  }

  const doc = snap.docs[0]!;

  if (doc.data()["status"] === "unsubscribed") {
    // Idempotente
    return { status: 200, body: { ok: true } };
  }

  await doc.ref.update({
    status: "unsubscribed",
    unsubscribedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { status: 200, body: { ok: true } };
}

// ── Helper: email double opt-in ───────────────────────────────────────
async function sendConfirmEmail(
  email: string,
  _emailNorm: string,
  locale: "it" | "en",
  confirmToken: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@vinifera.app";
  if (!apiKey) return;

  const isIt = locale === "it";
  const confirmUrl = `${SITE_URL}/${locale}/eventi/conferma-iscrizione?token=${confirmToken}`;
  // Unsubscribe token non è noto qui (verrà usato da future email) — omettiamo per ora
  // Il link disiscrizione sarà in sendNewEventNotification

  const subject = isIt
    ? "Conferma la tua iscrizione agli eventi Vinifera"
    : "Confirm your subscription to Vinifera events";

  const body = isIt
    ? `<p>Grazie per l'iscrizione! Clicca il link per confermare il tuo indirizzo email:</p>
       <p style="margin:20px 0"><a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;background:#145a44;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Conferma iscrizione</a></p>
       <p style="font-size:12px;color:#9ca3af;">Se non hai richiesto questa iscrizione, ignora questa email.</p>`
    : `<p>Thanks for subscribing! Click the link to confirm your email address:</p>
       <p style="margin:20px 0"><a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;background:#145a44;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Confirm subscription</a></p>
       <p style="font-size:12px;color:#9ca3af;">If you didn't request this subscription, please ignore this email.</p>`;

  const html = buildEmailHtml({ title: subject, body });

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  await resend.emails.send({ from: fromEmail, to: email, subject, html }).catch(console.error);
}
