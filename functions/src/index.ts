/**
 * Firebase Cloud Function v2 — Notifiche promemoria + rate
 *
 * Gira ogni minuto via Cloud Scheduler e invia notifiche
 * (Telegram / Email) per:
 *   1. Promemoria in scadenza (con supporto ricorrenza)
 *   2. Rate in avvicinamento alla scadenza (avviso anticipato)
 *   3. Rate scadute (overdue) — notifica una tantum
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
    installmentWarningDays: (d["installmentWarningDays"] as number | undefined) ?? 3,
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

function formatDateIT(d: Date): string {
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

/** Calcola la prossima data di scadenza per un promemoria ricorrente. */
function computeNextDue(
  base: Date,
  rule: "daily" | "weekly" | "monthly" | "yearly",
  interval: number,
): Date {
  const d = new Date(base);
  switch (rule) {
    case "daily":
      d.setDate(d.getDate() + interval);
      break;
    case "weekly":
      d.setDate(d.getDate() + interval * 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + interval);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + interval);
      break;
  }
  return d;
}

// ── Funzione schedulata: ogni minuto ──────────────────────────────────

export const checkReminders = onSchedule(
  {
    schedule: "* * * * *", // ogni minuto
    timeZone: "Europe/Rome",
    secrets: [resendApiKey, resendFromEmail],
    memory: "256MiB",
    timeoutSeconds: 60,
    region: "europe-west1",
  },
  async () => {
    const now = Timestamp.now();
    const notif = await loadNotifConfig();

    // ── 1. Promemoria ─────────────────────────────────────────────────
    const reminderSnap = await db
      .collection("reminders")
      .where("status", "==", "pending")
      .where("notifiedAt", "==", null)
      .get();

    const toNotify = reminderSnap.docs.filter((doc) => {
      const d = doc.data();
      const dueAt = d["dueAt"] as Timestamp | null;
      if (!dueAt) return false;
      const remindBefore = (d["remindBeforeMinutes"] as number | null) ?? 0;
      const notifyAt = new Date(dueAt.toDate().getTime() - remindBefore * 60_000);
      return notifyAt.getTime() <= now.toDate().getTime();
    });

    let notifiedReminders = 0;

    for (const doc of toNotify) {
      const d = doc.data();
      const title = d["title"] as string;
      const description = d["description"] as string | null;
      const channels = d["notifyChannels"] as { telegram: boolean; email: boolean } | null;
      const dueAt = (d["dueAt"] as Timestamp).toDate();
      const dueDateStr = dueAt.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const recurrence = d["recurrence"] as {
        rule: "daily" | "weekly" | "monthly" | "yearly";
        interval: number;
        until?: Timestamp;
      } | null;

      const messageText = [
        `🔔 <b>Promemoria: ${title}</b>`,
        description ?? null,
        `📅 Scade: ${dueDateStr}`,
      ]
        .filter(Boolean)
        .join("\n");

      try {
        if (channels?.telegram) {
          await sendTelegram(notif.telegramToken, notif.telegramChatId, messageText);
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

        if (recurrence) {
          // Promemoria ricorrente: crea la prossima istanza e chiudi quella corrente
          const nextDue = computeNextDue(dueAt, recurrence.rule, recurrence.interval);
          const until = recurrence.until ? recurrence.until.toDate() : null;
          if (!until || nextDue <= until) {
            await db.collection("reminders").add({
              title: d["title"],
              description: d["description"] ?? null,
              dueAt: Timestamp.fromDate(nextDue),
              relatedTo: d["relatedTo"] ?? null,
              status: "pending",
              remindBeforeMinutes: d["remindBeforeMinutes"] ?? null,
              notifyChannels: d["notifyChannels"],
              recurrence: d["recurrence"],
              notifiedAt: null,
              doneAt: null,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
              createdBy: d["createdBy"] ?? null,
            });
          }
          await doc.ref.update({
            status: "done",
            notifiedAt: FieldValue.serverTimestamp(),
            doneAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          await doc.ref.update({
            notifiedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        notifiedReminders++;
      } catch (err) {
        logger.error("Reminder notification failed", { id: doc.id, err });
      }
    }

    if (notifiedReminders > 0) {
      logger.info(`Notified ${notifiedReminders} reminder(s)`);
    }

    // ── 2. Rate in scadenza — avviso anticipato ───────────────────────
    const warningDays = notif.installmentWarningDays;
    if (warningDays > 0) {
      const warnThreshold = Timestamp.fromDate(
        new Date(now.toDate().getTime() + warningDays * 86_400_000),
      );

      // Cerca rate pending con dueAt entro la finestra e non ancora avvisate
      const upcomingSnap = await db
        .collectionGroup("installments")
        .where("status", "==", "pending")
        .where("dueAt", "<=", warnThreshold)
        .where("warnNotifiedAt", "==", null)
        .get();

      // Filtra quelle con dueAt >= now (non ancora scadute)
      const toWarn = upcomingSnap.docs.filter((instDoc) => {
        const dueAt = instDoc.data()["dueAt"] as Timestamp | null;
        return dueAt && dueAt.toDate() >= now.toDate();
      });

      if (toWarn.length > 0) {
        // Fetch i payment parent in batch
        const paymentIds = [
          ...new Set(
            toWarn
              .map((instDoc) => instDoc.ref.parent.parent?.id)
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        const paymentDocs = await Promise.all(
          paymentIds.map((id) => db.collection("payments").doc(id).get()),
        );
        const paymentMap = new Map(paymentDocs.map((p) => [p.id, p.data()]));

        let warnedInstallments = 0;
        for (const instDoc of toWarn) {
          const d = instDoc.data();
          const dueAt = (d["dueAt"] as Timestamp).toDate();
          const amountCents = (d["amountCents"] as number) ?? 0;
          const index = (d["index"] as number) ?? 1;
          const paymentId = instDoc.ref.parent.parent?.id ?? "";
          const paymentDesc = (paymentMap.get(paymentId)?.["description"] as string | undefined) ?? "";

          const msLeft = dueAt.getTime() - now.toDate().getTime();
          const daysLeft = Math.ceil(msLeft / 86_400_000);
          const daysLabel =
            daysLeft === 0 ? "oggi" : daysLeft === 1 ? "domani" : `tra ${daysLeft} giorni`;

          const subject = `Rata ${index} in scadenza ${daysLabel}`;
          const msgText = [
            `💶 <b>${subject}</b>`,
            paymentDesc || null,
            `${formatCents(amountCents)} · Scadenza: ${formatDateIT(dueAt)}`,
          ]
            .filter(Boolean)
            .join("\n");

          try {
            await sendTelegram(notif.telegramToken, notif.telegramChatId, msgText);
            if (notif.notifyEmail) {
              const emailHtml = buildEmailHtml(subject, [
                paymentDesc ? `<p>${paymentDesc}</p>` : "",
                `<p><strong>Importo:</strong> ${formatCents(amountCents)}</p>`,
                `<p><strong>Scadenza:</strong> ${formatDateIT(dueAt)}</p>`,
              ].filter(Boolean).join(""));
              await sendEmail(
                resendApiKey.value(),
                resendFromEmail.value() || "noreply@vinifera.app",
                notif.notifyEmail,
                subject,
                `${subject}\n${paymentDesc}\n${formatCents(amountCents)} · ${formatDateIT(dueAt)}`,
                emailHtml,
              );
            }
            await instDoc.ref.update({
              warnNotifiedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            warnedInstallments++;
          } catch (err) {
            logger.error("Installment warn notification failed", { id: instDoc.id, err });
          }
        }

        if (warnedInstallments > 0) {
          logger.info(`Warned ${warnedInstallments} upcoming installment(s)`);
        }
      }
    }

    // ── 3. Rate scadute (overdue) — notifica una tantum ───────────────
    const overdueSnap = await db
      .collectionGroup("installments")
      .where("status", "==", "overdue")
      .where("overdueNotifiedAt", "==", null)
      .get();

    if (overdueSnap.docs.length > 0) {
      // Fetch i payment parent in batch
      const overduePaymentIds = [
        ...new Set(
          overdueSnap.docs
            .map((instDoc) => instDoc.ref.parent.parent?.id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const overduePaymentDocs = await Promise.all(
        overduePaymentIds.map((id) => db.collection("payments").doc(id).get()),
      );
      const overduePaymentMap = new Map(overduePaymentDocs.map((p) => [p.id, p.data()]));

      let notifiedOverdue = 0;
      for (const instDoc of overdueSnap.docs) {
        const d = instDoc.data();
        const dueAt = (d["dueAt"] as Timestamp).toDate();
        const amountCents = (d["amountCents"] as number) ?? 0;
        const index = (d["index"] as number) ?? 1;
        const paymentId = instDoc.ref.parent.parent?.id ?? "";
        const paymentDesc = (overduePaymentMap.get(paymentId)?.["description"] as string | undefined) ?? "";

        const subject = `Rata ${index} scaduta`;
        const msgText = [
          `⚠️ <b>${subject}</b>`,
          paymentDesc || null,
          `${formatCents(amountCents)} · Era prevista per: ${formatDateIT(dueAt)}`,
        ]
          .filter(Boolean)
          .join("\n");

        try {
          await sendTelegram(notif.telegramToken, notif.telegramChatId, msgText);
          if (notif.notifyEmail) {
            const emailHtml = buildEmailHtml(subject, [
              paymentDesc ? `<p>${paymentDesc}</p>` : "",
              `<p><strong>Importo:</strong> ${formatCents(amountCents)}</p>`,
              `<p><strong>Scadenza prevista:</strong> ${formatDateIT(dueAt)}</p>`,
            ].filter(Boolean).join(""));
            await sendEmail(
              resendApiKey.value(),
              resendFromEmail.value() || "noreply@vinifera.app",
              notif.notifyEmail,
              subject,
              `${subject}\n${paymentDesc}\n${formatCents(amountCents)} · ${formatDateIT(dueAt)}`,
              emailHtml,
            );
          }
          await instDoc.ref.update({
            overdueNotifiedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          notifiedOverdue++;
        } catch (err) {
          logger.error("Overdue installment notification failed", { id: instDoc.id, err });
        }
      }

      if (notifiedOverdue > 0) {
        logger.info(`Notified ${notifiedOverdue} overdue installment(s)`);
      }
    }
  },
);
