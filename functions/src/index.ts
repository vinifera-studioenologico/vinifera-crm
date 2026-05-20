/**
 * Firebase Cloud Function v2 — Notifiche promemoria
 *
 * Gira ogni minuto via Cloud Scheduler e invia notifiche
 * (Telegram / Email) per i promemoria in scadenza.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";

initializeApp();

const db = getFirestore();

// ── Secrets (impostati tramite firebase functions:secrets:set) ─────────
const resendApiKey = defineSecret("RESEND_API_KEY");
const resendFromEmail = defineSecret("RESEND_FROM_EMAIL");

// ── Helpers ───────────────────────────────────────────────────────────

async function loadNotifConfig() {
  const snap = await db.doc("settings/notifications").get();
  const d = snap.data() ?? {};
  return {
    telegramToken: (d["telegramBotToken"] as string | undefined) ?? "",
    telegramChatId: (d["telegramChatId"] as string | undefined) ?? "",
    notifyEmail: (d["notifyEmail"] as string | undefined) ?? "",
  };
}

async function sendTelegram(
  token: string,
  chatId: string,
  text: string,
): Promise<void> {
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

async function sendEmail(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  text: string,
  htmlBody: string,
): Promise<void> {
  if (!apiKey || !to) return;
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  await resend.emails.send({ from, to, subject, text, html: htmlBody });
}

/** Genera HTML email con branding Vinifera */
function buildEmailHtml(title: string, body: string): string {
  const BRAND = "#145a44";
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f0f4f2;font-family:system-ui,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f2;padding:40px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0"
  style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.10);">
<tr><td style="background:${BRAND};padding:32px 40px;text-align:center;">
  <p style="margin:0;color:#fff;font-size:26px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Vinifera</p>
  <p style="margin:6px 0 0;color:#a7c4b8;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Studio Enologico</p>
</td></tr>
<tr><td style="padding:36px 40px;">
  <h1 style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND};">${esc(title)}</h1>
  <div style="font-size:14px;line-height:1.7;color:#374151;">${body}</div>
</td></tr>
<tr><td style="padding:0 40px 32px;text-align:center;">
  <p style="margin:0;font-size:11px;color:#9ca3af;">Vinifera CRM</p>
</td></tr>
</table>
</td></tr></table></body></html>`;
}

// ── Funzione schedulata: ogni minuto ──────────────────────────────────

export const checkReminders = onSchedule(
  {
    schedule: "* * * * *", // ogni minuto
    timeZone: "Europe/Rome",
    secrets: [resendApiKey, resendFromEmail],
    // Limiti ragionevoli per una funzione leggera
    memory: "256MiB",
    timeoutSeconds: 60,
    region: "europe-west1",
  },
  async () => {
    const now = Timestamp.now();
    const notif = await loadNotifConfig();

    // Promemoria pending non ancora notificati
    const snap = await db
      .collection("reminders")
      .where("status", "==", "pending")
      .where("notifiedAt", "==", null)
      .get();

    const toNotify = snap.docs.filter((doc) => {
      const d = doc.data();
      const dueAt = d["dueAt"] as Timestamp | null;
      if (!dueAt) return false;
      const remindBefore = (d["remindBeforeMinutes"] as number | null) ?? 0;
      const notifyAt = new Date(
        dueAt.toDate().getTime() - remindBefore * 60_000,
      );
      return notifyAt.getTime() <= now.toDate().getTime();
    });

    let notified = 0;

    for (const doc of toNotify) {
      const d = doc.data();
      const title = d["title"] as string;
      const description = d["description"] as string | null;
      const channels = d["notifyChannels"] as {
        telegram: boolean;
        email: boolean;
      } | null;
      const dueAt = (d["dueAt"] as Timestamp).toDate();
      const dueDateStr = dueAt.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const messageText = [
        `🔔 <b>Promemoria: ${title}</b>`,
        description ?? null,
        `📅 Scade: ${dueDateStr}`,
      ]
        .filter(Boolean)
        .join("\n");

      try {
        if (channels?.telegram) {
          await sendTelegram(
            notif.telegramToken,
            notif.telegramChatId,
            messageText,
          );
        }
        if (channels?.email && notif.notifyEmail) {
          const emailHtml = buildEmailHtml(`Promemoria: ${title}`, [
            description ? `<p>${description}</p>` : "",
            `<p>📅 <strong>Scadenza:</strong> ${dueDateStr}</p>`,
          ].filter(Boolean).join(""));

          await sendEmail(
            resendApiKey.value(),
            resendFromEmail.value() || "noreply@vinifera.app",
            notif.notifyEmail,
            `Promemoria: ${title}`,
            `${title}\n${description ?? ""}\nScade: ${dueDateStr}`,
            emailHtml,
          );
        }

        await doc.ref.update({
          notifiedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        notified++;
      } catch (err) {
        logger.error("Notification failed for reminder", {
          id: doc.id,
          err,
        });
      }
    }

    if (notified > 0) {
      logger.info(`Notified ${notified} reminder(s)`);
    }
  },
);
