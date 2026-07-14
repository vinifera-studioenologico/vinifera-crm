import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { buildEmailHtml } from "@/lib/email";
import { logger } from "@/lib/logger";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.viniferastudioenologico.it";

interface EventForNotification {
  id: string;
  slug: string;
  title: { it: string; en: string };
  startsAt: string; // ISO
}

/**
 * Invia una notifica "nuovo evento prenotabile" a tutti gli iscritti `active`.
 * Guardia transazionale su `subscribersNotifiedAt`: il flag viene impostato
 * PRIMA dell'invio, dentro la transazione, per evitare double-send tra
 * invocazioni parallele o retry. Se il flag è già impostato, non fa nulla.
 */
export async function sendNewEventNotification(
  event: EventForNotification,
): Promise<void> {
  const eventRef = adminDb.collection("events").doc(event.id);

  // Transazione di check-and-set atomica
  const canSend = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(eventRef);
    if (!snap.exists) return false;
    const current = snap.data()!;
    // Controlla sia null che undefined (documento esistente ma campo non impostato)
    if (current["subscribersNotifiedAt"] !== null && current["subscribersNotifiedAt"] !== undefined) {
      return false; // Già notificato
    }
    tx.update(eventRef, {
      subscribersNotifiedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (!canSend) {
    logger.info(`[EventsNotify] subscribersNotifiedAt già impostato per ${event.id} — skip`);
    return;
  }

  // Leggi tutti gli iscritti attivi
  const subscribersSnap = await adminDb
    .collection("eventSubscribers")
    .where("status", "==", "active")
    .get();

  if (subscribersSnap.empty) {
    logger.info(`[EventsNotify] Nessun iscritto attivo per evento ${event.id}`);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@vinifera.app";

  if (!apiKey) {
    logger.warn("[EventsNotify] RESEND_API_KEY non configurato — email non inviate");
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  let sent = 0;
  for (const subDoc of subscribersSnap.docs) {
    const sub = subDoc.data();
    const locale: "it" | "en" = sub["locale"] ?? "it";
    const email: string = sub["email"] ?? "";
    const unsubscribeToken: string = sub["unsubscribeToken"] ?? "";
    if (!email) continue;

    const isIt = locale === "it";
    const eventTitle = event.title[locale] || event.title.it;
    const eventUrl = `${SITE_URL}/${locale}/eventi/${event.slug}`;
    const unsubscribeUrl = `${SITE_URL}/${locale}/eventi/disiscrizione?token=${unsubscribeToken}`;

    let startsAtFormatted = "";
    try {
      startsAtFormatted = new Date(event.startsAt).toLocaleDateString(
        locale === "it" ? "it-IT" : "en-GB",
        { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" },
      );
    } catch {
      startsAtFormatted = event.startsAt;
    }

    const subject = isIt
      ? `Nuovo evento disponibile: ${eventTitle}`
      : `New event available: ${eventTitle}`;

    const body = isIt
      ? `<p>Le prenotazioni per <strong>${eventTitle}</strong> sono ora aperte.</p>
         <p>📅 ${startsAtFormatted}</p>
         <p style="margin:20px 0"><a href="${eventUrl}" style="display:inline-block;padding:12px 24px;background:#145a44;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Scopri l'evento</a></p>
         <p style="font-size:11px;color:#9ca3af;margin-top:24px;">Non vuoi più ricevere queste email? <a href="${unsubscribeUrl}" style="color:#9ca3af;">Disiscrivi</a></p>`
      : `<p>Bookings for <strong>${eventTitle}</strong> are now open.</p>
         <p>📅 ${startsAtFormatted}</p>
         <p style="margin:20px 0"><a href="${eventUrl}" style="display:inline-block;padding:12px 24px;background:#145a44;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Discover the event</a></p>
         <p style="font-size:11px;color:#9ca3af;margin-top:24px;">Don't want to receive these emails? <a href="${unsubscribeUrl}" style="color:#9ca3af;">Unsubscribe</a></p>`;

    const html = buildEmailHtml({ title: subject, body });

    await resend.emails
      .send({ from: fromEmail, to: email, subject, html })
      .then(() => { sent++; })
      .catch((err) => logger.error("[EventsNotify] Invio email fallito", { email, err }));
  }

  logger.info(`[EventsNotify] Inviate ${sent} notifiche per evento ${event.id}`);
}
