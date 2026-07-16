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
import { defineSecret, defineString } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import {
  computeNextOccurrence,
  buildNewEventSlug,
  shiftDate,
} from "./event-logic";

initializeApp();

const db = getFirestore();

// ── Secrets e params ──────────────────────────────────────────────────
const resendApiKey = defineSecret("RESEND_API_KEY");
const resendFromEmail = defineSecret("RESEND_FROM_EMAIL");
// Nuovi per checkEvents (indipendenti dagli env Vercel — impostare con firebase functions:secrets:set)
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const crmApiKey = defineSecret("CRM_API_KEY");
const siteUrl = defineString("SITE_URL", { default: "" });

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

/**
 * Calcola la prossima data di scadenza per un costo fisso
 * rispetto a `today` in base a frequency, paymentDay, paymentMonth.
 */
function computeNextFixedCostDue(
  today: Date,
  frequency: string,
  paymentDay: number,
  paymentMonth: number | null,
): Date | null {
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-based
  const clampDay = (y: number, m: number, day: number) => {
    const max = new Date(y, m + 1, 0).getDate();
    return Math.min(day, max);
  };

  if (frequency === "monthly") {
    // Prossima data = paymentDay di questo mese, oppure prossimo mese se già passata
    let candidate = new Date(year, month, clampDay(year, month, paymentDay));
    if (candidate < today) {
      const nextMonth = month + 1;
      candidate = new Date(year, nextMonth, clampDay(year, nextMonth, paymentDay));
    }
    return candidate;
  }

  if (frequency === "quarterly" && paymentMonth != null) {
    // paymentMonth è 1-based. Generiamo i 4 mesi di pagamento nell'anno
    const baseMonth = paymentMonth - 1; // 0-based
    const months = [baseMonth, baseMonth + 3, baseMonth + 6, baseMonth + 9];
    for (const m of months) {
      const y = m >= 12 ? year + 1 : year;
      const adjM = m % 12;
      const candidate = new Date(y, adjM, clampDay(y, adjM, paymentDay));
      if (candidate >= today) return candidate;
    }
    // Tutti passati quest'anno → primo del prossimo ciclo
    const nextYear = year + 1;
    const adjM = baseMonth % 12;
    return new Date(nextYear, adjM, clampDay(nextYear, adjM, paymentDay));
  }

  if (frequency === "annual" && paymentMonth != null) {
    const m = paymentMonth - 1; // 0-based
    let candidate = new Date(year, m, clampDay(year, m, paymentDay));
    if (candidate < today) {
      candidate = new Date(year + 1, m, clampDay(year + 1, m, paymentDay));
    }
    return candidate;
  }

  return null;
}

/** Verifica se oggi è esattamente il giorno di pagamento di un costo fisso. */
function isFixedCostDueToday(
  today: Date,
  frequency: string,
  paymentDay: number,
  paymentMonth: number | null,
): boolean {
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-based
  const maxDay = new Date(year, month + 1, 0).getDate();
  const effectiveDay = Math.min(paymentDay, maxDay);
  if (today.getDate() !== effectiveDay) return false;

  if (frequency === "monthly") return true;

  if (frequency === "quarterly" && paymentMonth != null) {
    const baseMonth = paymentMonth - 1; // 0-based
    return ((month - baseMonth) % 3 + 3) % 3 === 0;
  }

  if (frequency === "annual" && paymentMonth != null) {
    return month === paymentMonth - 1;
  }

  return false;
}

/** Formatta una data come "YYYY-MM-DD" (giorno locale, non UTC). */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

    // ── 4. Costi fissi in scadenza — promemoria anticipato ────────────
    const fixedCostsSnap = await db
      .collection("costFixedCosts")
      .where("active", "==", true)
      .where("deletedAt", "==", null)
      .get();

    let notifiedFixedCosts = 0;
    let generatedFixedCostExpenses = 0;

    for (const fcDoc of fixedCostsSnap.docs) {
      const fc = fcDoc.data();
      const paymentDay = (fc["paymentDay"] as number | undefined) ?? 1;
      const paymentMonth = (fc["paymentMonth"] as number | undefined) ?? null;
      const frequency = (fc["frequency"] as string | undefined) ?? "monthly";
      const name = (fc["name"] as string) ?? "Costo fisso";
      const amountCents = (fc["amountCents"] as number) ?? 0;
      const today = now.toDate();

      // ── 4a. Alla scadenza esatta: genera automaticamente la spesa in "Spese" ──
      if (isFixedCostDueToday(today, frequency, paymentDay, paymentMonth)) {
        const todayStr = toDateStr(today);
        const lastExpenseCreatedForDue = fc["lastExpenseCreatedForDue"] as string | null | undefined;
        if (lastExpenseCreatedForDue !== todayStr) {
          // Titolo spesa = nome costo fisso; descrizione spesa = descrizione costo fisso
          // (con fallback al nome, perché la descrizione della spesa è un campo obbligatorio).
          const fcDescription = (fc["description"] as string | undefined)?.trim();
          try {
            await db.collection("costExpenses").add({
              description: fcDescription || name,
              category: "fixed_cost",
              supplier: name,
              invoiceNumber: null,
              date: todayStr,
              periodFrom: null,
              periodTo: null,
              totalCents: amountCents,
              notes: null,
              items: null,
              pdfStoragePath: null,
              pdfUrl: null,
              aiParsed: false,
              fixedCostRef: fcDoc.id,
              version: 0,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
              deletedAt: null,
              createdBy: null,
            });
            await fcDoc.ref.update({
              lastExpenseCreatedForDue: todayStr,
              updatedAt: FieldValue.serverTimestamp(),
            });
            generatedFixedCostExpenses++;
          } catch (err) {
            logger.error("Fixed cost expense generation failed", { id: fcDoc.id, err });
          }
        }
      }

      // ── 4b. Promemoria anticipato (invariato) ─────────────────────────
      const notifyTelegram = fc["notifyTelegram"] as boolean | undefined;
      const notifyEmail = fc["notifyEmail"] as boolean | undefined;
      if (!notifyTelegram && !notifyEmail) continue;

      const daysBefore = (fc["reminderDaysBefore"] as number | undefined) ?? 3;

      // Calcola la prossima data di scadenza
      const nextDue = computeNextFixedCostDue(today, frequency, paymentDay, paymentMonth);
      if (!nextDue) continue;

      // Verifica se siamo nella finestra di notifica (scadenza - daysBefore <= oggi)
      const notifyFrom = new Date(nextDue.getTime() - daysBefore * 86_400_000);
      if (today < notifyFrom) continue;

      // Evita notifiche duplicate: controlla lastNotifiedForDue
      const lastNotifiedForDue = fc["lastNotifiedForDue"] as Timestamp | null | undefined;
      if (lastNotifiedForDue) {
        const lastDate = lastNotifiedForDue.toDate();
        // Se abbiamo già notificato per la stessa scadenza (stesso giorno target), skip
        if (lastDate.getTime() >= notifyFrom.getTime()) continue;
      }

      const daysLeft = Math.ceil((nextDue.getTime() - today.getTime()) / 86_400_000);
      const daysLabel =
        daysLeft <= 0 ? "oggi" : daysLeft === 1 ? "domani" : `tra ${daysLeft} giorni`;
      const subject = `Costo fisso: ${name} in scadenza ${daysLabel}`;
      const msgText = [
        `🏦 <b>${subject}</b>`,
        `${formatCents(amountCents)} · Scadenza: ${formatDateIT(nextDue)}`,
      ].join("\n");

      try {
        if (notifyTelegram) {
          await sendTelegram(notif.telegramToken, notif.telegramChatId, msgText);
        }
        if (notifyEmail && notif.notifyEmail) {
          const emailHtml = buildEmailHtml(subject, [
            `<p><strong>Importo:</strong> ${formatCents(amountCents)}</p>`,
            `<p><strong>Scadenza:</strong> ${formatDateIT(nextDue)}</p>`,
          ].join(""));
          await sendEmail(
            resendApiKey.value(),
            resendFromEmail.value() || "noreply@vinifera.app",
            notif.notifyEmail,
            subject,
            `${subject}\n${formatCents(amountCents)} · ${formatDateIT(nextDue)}`,
            emailHtml,
          );
        }
        await fcDoc.ref.update({
          lastNotifiedForDue: Timestamp.fromDate(nextDue),
          updatedAt: FieldValue.serverTimestamp(),
        });
        notifiedFixedCosts++;
      } catch (err) {
        logger.error("Fixed cost notification failed", { id: fcDoc.id, err });
      }
    }

    if (notifiedFixedCosts > 0) {
      logger.info(`Notified ${notifiedFixedCosts} fixed cost(s) approaching due date`);
    }
    if (generatedFixedCostExpenses > 0) {
      logger.info(`Generated ${generatedFixedCostExpenses} expense(s) from fixed cost(s) due today`);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
//  checkEvents — Scadenza hold, apertura prenotazioni, ricorrenza eventi
// ─────────────────────────────────────────────────────────────────────────────

const HOLD_GRACE_SECONDS = 90;

export const checkEvents = onSchedule(
  {
    schedule: "* * * * *",
    timeZone: "Europe/Rome",
    secrets: [stripeSecretKey, crmApiKey],
    memory: "256MiB",
    timeoutSeconds: 60,
    region: "europe-west1",
  },
  async () => {
    const now = new Date();

    // ── 1. Rilascio hold scaduti ──────────────────────────────────────
    // Cerca ordini pending_payment con holdExpiresAt <= now - grace (90s)
    const graceThreshold = Timestamp.fromDate(
      new Date(now.getTime() - HOLD_GRACE_SECONDS * 1000),
    );

    const holdSnap = await db
      .collection("eventOrders")
      .where("status", "==", "pending_payment")
      .where("holdExpiresAt", "<=", graceThreshold)
      .get();

    let releasedCount = 0;

    for (const orderDoc of holdSnap.docs) {
      const d = orderDoc.data();
      const piId = d["paymentIntentId"] as string | null;
      const eventId = d["eventId"] as string;
      const seats = (d["seats"] as number) ?? 0;

      try {
        // Cancella il PaymentIntent (se già succeeded, Stripe ignora silenziosamente)
        if (piId) {
          const Stripe = await import("stripe");
          const stripe = new Stripe.default(stripeSecretKey.value(), {
            apiVersion: "2026-06-24.dahlia" as const,
          } as Parameters<typeof Stripe.default>[1]);
          await stripe.paymentIntents.cancel(piId).catch((err: { code?: string }) => {
            if (err?.code === "payment_intent_unexpected_state") {
              // Già succeeded — il webhook M4 gestirà la riconciliazione
              logger.info(`PI ${piId} già in stato terminale, skip cancel`);
            } else {
              throw err;
            }
          });
        }

        // Transazione: marca expired + rilascia seatsHeld
        await db.runTransaction(async (tx) => {
          const orderRef = db.collection("eventOrders").doc(orderDoc.id);
          const eventRef = db.collection("events").doc(eventId);

          const freshOrder = await tx.get(orderRef);
          // Idempotenza: se non è più pending_payment, skip
          if (freshOrder.data()?.["status"] !== "pending_payment") return;

          tx.update(orderRef, {
            status: "expired",
            updatedAt: FieldValue.serverTimestamp(),
          });
          tx.update(eventRef, {
            seatsHeld: FieldValue.increment(-seats),
            updatedAt: FieldValue.serverTimestamp(),
          });
        });

        releasedCount++;
        logger.info(`Hold rilasciato: ordine ${orderDoc.id}, evento ${eventId}`);
      } catch (err) {
        logger.error(`Errore rilascio hold per ordine ${orderDoc.id}`, err);
      }
    }

    // Se almeno un hold è stato rilasciato → revalidation push
    if (releasedCount > 0) {
      const url = siteUrl.value();
      const key = crmApiKey.value();
      if (url && key) {
        fetch(`${url}/api/revalidate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({ tag: "events" }),
        }).catch((err) => logger.error("Revalidation push fallita", err));
      }
      logger.info(`${releasedCount} hold rilasciato/i`);
    }

    // ── 2. Apertura prenotazioni (bookingOpensAt → bookable) ──────────
    // Lo stato bookable è derivato — nessuna scrittura necessaria per la correttezza.
    // Qui gestiamo: push revalidation + TODO M7 (notifica mailing list).
    const bookingOpenSnap = await db
      .collection("events")
      .where("status", "==", "published")
      .where("bookingOpensAt", "<=", Timestamp.fromDate(now))
      .where("subscribersNotifiedAt", "==", null)
      .get();

    for (const evDoc of bookingOpenSnap.docs) {
      const d = evDoc.data();
      const bookingOpensAt = (d["bookingOpensAt"] as Timestamp | null)?.toDate();

      // Verifica che bookingOpensAt sia davvero passato (la query potrebbe contenere
      // eventi con bookingOpensAt null per via di Firestore null ordering)
      if (!bookingOpensAt || bookingOpensAt > now) continue;

      try {
        // Push revalidation per aggiornare il badge sul sito
        const url = siteUrl.value();
        const key = crmApiKey.value();
        if (url && key) {
          fetch(`${url}/api/revalidate`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({ tag: "events" }),
          }).catch((err) => logger.error("Revalidation push fallita", err));
        }

        // M7: notifica mailing list (guardia transazionale su subscribersNotifiedAt)
        const canNotify = await db.runTransaction(async (tx) => {
          const freshSnap = await tx.get(evDoc.ref);
          if (!freshSnap.exists) return false;
          const current = freshSnap.data()!;
          if (current["subscribersNotifiedAt"] !== null && current["subscribersNotifiedAt"] !== undefined) {
            return false; // già notificato
          }
          tx.update(evDoc.ref, {
            subscribersNotifiedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          return true;
        });

        if (canNotify) {
          // Invia email agli iscritti attivi
          const subscribersSnap = await db
            .collection("eventSubscribers")
            .where("status", "==", "active")
            .get();

          const resendKey = resendApiKey.value();
          const fromEmail = resendFromEmail.value() || "noreply@vinifera.app";
          const siteUrlVal = siteUrl.value();

          if (resendKey && !subscribersSnap.empty) {
            const { Resend } = await import("resend");
            const resend = new Resend(resendKey);
            const evData = evDoc.data();
            const titleIt = (evData["title"] as Record<string, string>)?.["it"] ?? "";
            const slug = evData["slug"] as string ?? "";
            const startsAtDate = (evData["startsAt"] as Timestamp).toDate();

            for (const subDoc of subscribersSnap.docs) {
              const sub = subDoc.data();
              const locale: string = sub["locale"] ?? "it";
              const email: string = sub["email"] ?? "";
              const unsubToken: string = sub["unsubscribeToken"] ?? "";
              if (!email) continue;

              const isIt = locale === "it";
              const eventTitle = (evData["title"] as Record<string, string>)?.[locale] || titleIt;
              const eventUrl = `${siteUrlVal}/${locale}/eventi/${slug}`;
              const unsubUrl = `${siteUrlVal}/${locale}/eventi/disiscrizione?token=${unsubToken}`;
              const dateStr = startsAtDate.toLocaleDateString(isIt ? "it-IT" : "en-GB", {
                day: "numeric", month: "long", year: "numeric",
              });

              const subject = isIt
                ? `Nuovo evento disponibile: ${eventTitle}`
                : `New event available: ${eventTitle}`;

              const html = buildEmailHtml(subject,
                isIt
                  ? `<p>Le prenotazioni per <strong>${eventTitle}</strong> sono ora aperte.</p><p>📅 ${dateStr}</p><p style="margin:20px 0"><a href="${eventUrl}" style="display:inline-block;padding:12px 24px;background:#145a44;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Scopri l'evento</a></p><p style="font-size:11px;color:#9ca3af"><a href="${unsubUrl}" style="color:#9ca3af;">Disiscrivi</a></p>`
                  : `<p>Bookings for <strong>${eventTitle}</strong> are now open.</p><p>📅 ${dateStr}</p><p style="margin:20px 0"><a href="${eventUrl}" style="display:inline-block;padding:12px 24px;background:#145a44;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Discover the event</a></p><p style="font-size:11px;color:#9ca3af"><a href="${unsubUrl}" style="color:#9ca3af;">Unsubscribe</a></p>`,
              );

              await resend.emails.send({ from: fromEmail, to: email, subject, html }).catch(() => {});
            }
          }
        }

        logger.info(`Apertura prenotazioni rilevata per evento ${evDoc.id}`);
      } catch (err) {
        logger.error(`Errore apertura prenotazioni evento ${evDoc.id}`, err);
      }
    }

    // ── 3. Ricorrenza eventi conclusi ─────────────────────────────────
    // Cerca eventi published con startsAt < now, recurrence != null, recurrenceProcessedAt == null
    const pastRecurringSnap = await db
      .collection("events")
      .where("status", "==", "published")
      .where("startsAt", "<", Timestamp.fromDate(now))
      .where("recurrenceProcessedAt", "==", null)
      .get();

    for (const evDoc of pastRecurringSnap.docs) {
      const d = evDoc.data();
      const recurrence = d["recurrence"] as {
        rule: "daily" | "weekly" | "monthly" | "yearly";
        interval: number;
        until?: Timestamp;
      } | null;

      // Salta se nessuna ricorrenza configurata
      if (!recurrence) continue;

      const startsAt = (d["startsAt"] as Timestamp).toDate();
      const endsAt = (d["endsAt"] as Timestamp | null)?.toDate() ?? null;
      const bookingOpensAt = (d["bookingOpensAt"] as Timestamp | null)?.toDate() ?? null;
      const bookingClosesAt = (d["bookingClosesAt"] as Timestamp | null)?.toDate() ?? null;
      const until = recurrence.until ? recurrence.until.toDate() : null;

      // Calcola la data della prossima istanza
      const nextStartsAt = computeNextOccurrence(startsAt, recurrence.rule, recurrence.interval);

      // Se until è superato, non creare
      if (until && nextStartsAt > until) {
        // Setta recurrenceProcessedAt per non riprocessare
        await evDoc.ref.update({
          recurrenceProcessedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        continue;
      }

      const deltaMs = nextStartsAt.getTime() - startsAt.getTime();
      const newSlug = buildNewEventSlug(d["slug"] as string, nextStartsAt);

      // Verifica unicità slug (non duplicare se già esiste)
      const slugCheck = await db
        .collection("events")
        .where("slug", "==", newSlug)
        .where("deletedAt", "==", null)
        .limit(1)
        .get();

      if (!slugCheck.empty) {
        // Istanza già creata (invocazione precedente) — setta guard
        await evDoc.ref.update({
          recurrenceProcessedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        continue;
      }

      try {
        const newDoc: Record<string, unknown> = {
          slug: newSlug,
          status: "draft",
          title: d["title"],
          summary: d["summary"],
          description: d["description"],
          imageUrl: d["imageUrl"],
          images: d["images"],
          location: d["location"],
          startsAt: Timestamp.fromDate(nextStartsAt),
          endsAt: endsAt ? Timestamp.fromDate(shiftDate(endsAt, deltaMs)!) : null,
          bookingOpensAt: bookingOpensAt ? Timestamp.fromDate(shiftDate(bookingOpensAt, deltaMs)!) : null,
          bookingClosesAt: bookingClosesAt ? Timestamp.fromDate(shiftDate(bookingClosesAt, deltaMs)!) : null,
          capacity: d["capacity"],
          maxSeatsPerOrder: d["maxSeatsPerOrder"] ?? null,
          priceCents: d["priceCents"],
          discountedPriceCents: d["discountedPriceCents"] ?? null,
          featured: false, // la nuova istanza non è in evidenza di default
          recurrence: d["recurrence"],
          recurrenceParentId: evDoc.id,
          recurrenceProcessedAt: null,
          seatsSold: 0,
          seatsHeld: 0,
          subscribersNotifiedAt: null,
          cancelledAt: null,
          version: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          deletedAt: null,
          createdBy: d["createdBy"] ?? null,
        };

        await db.runTransaction(async (tx) => {
          // Crea la nuova istanza draft
          const newEvRef = db.collection("events").doc();
          tx.set(newEvRef, newDoc);

          // Marca l'istanza corrente come processata
          tx.update(evDoc.ref, {
            recurrenceProcessedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        });

        // Notifica admin via Telegram
        const notif = await loadNotifConfig();
        const msgText = [
          `📅 <b>Nuova istanza evento creata in bozza</b>`,
          `Evento: <b>${(d["title"] as Record<string, string>)?.["it"] ?? newSlug}</b>`,
          `Data: ${nextStartsAt.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}`,
          `Slug: <code>${newSlug}</code>`,
          `Azione: pubblica manualmente dal CRM prima dell'apertura prenotazioni.`,
        ].join("\n");
        await sendTelegram(notif.telegramToken, notif.telegramChatId, msgText);

        logger.info(`Nuova istanza ricorrente creata: ${newSlug} per evento ${evDoc.id}`);
      } catch (err) {
        logger.error(`Errore creazione istanza ricorrente per evento ${evDoc.id}`, err);
      }
    }
  },
);
