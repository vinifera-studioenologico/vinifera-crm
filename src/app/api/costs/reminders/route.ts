import { type NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { buildEmailHtml } from "@/lib/email";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Protetto da Authorization: Bearer <CRON_SECRET>
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

interface FixedCostEntry {
  name: string;
  amountCents: number;
  frequency: string;
  notifyTelegram: boolean;
  notifyEmail: boolean;
  reminderDaysBefore: number;
}

const FREQ_LABEL: Record<string, string> = {
  monthly: "mensile",
  quarterly: "trimestrale",
  annual: "annuale",
};

/**
 * Determina se un costo fisso è "in scadenza" entro N giorni dal 1° del prossimo mese.
 * - monthly: sempre in scadenza (ogni mese)
 * - quarterly: mesi 1, 4, 7, 10
 * - annual: mese 1 (gennaio)
 */
function isDueNextMonth(frequency: string, today: Date): boolean {
  const nextMonth = today.getMonth() + 2; // 1-based del prossimo mese
  const effectiveMonth = nextMonth > 12 ? 1 : nextMonth;

  switch (frequency) {
    case "monthly":
      return true;
    case "quarterly":
      return [1, 4, 7, 10].includes(effectiveMonth);
    case "annual":
      return effectiveMonth === 1;
    default:
      return false;
  }
}

function formatEUR(cents: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

// ── Cron: reminder costi fissi ────────────────────────────────────────
// Da eseguire giornalmente. Invia notifica aggregata X giorni prima del 1° del mese.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const currentDay = today.getDate();

  // Calcola giorni rimanenti fino al 1° del prossimo mese
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstOfNextMonth = new Date(year, month + 1, 1);
  const daysUntilFirst = Math.ceil(
    (firstOfNextMonth.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  // Carica costi fissi attivi con notifiche abilitate
  const snap = await adminDb
    .collection("costFixedCosts")
    .where("deletedAt", "==", null)
    .where("active", "==", true)
    .get();

  const dueCosts: FixedCostEntry[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const notifyTelegram = data["notifyTelegram"] ?? true;
    const notifyEmail = data["notifyEmail"] ?? false;
    if (!notifyTelegram && !notifyEmail) continue;

    const frequency = data["frequency"] as string;
    if (!isDueNextMonth(frequency, today)) continue;

    const reminderDaysBefore = (data["reminderDaysBefore"] as number) ?? 3;

    // Notifica solo se siamo esattamente a X giorni dal 1°
    if (daysUntilFirst !== reminderDaysBefore) continue;

    dueCosts.push({
      name: data["name"] ?? "Senza nome",
      amountCents: data["amountCents"] ?? 0,
      frequency,
      notifyTelegram,
      notifyEmail,
      reminderDaysBefore,
    });
  }

  if (dueCosts.length === 0) {
    return NextResponse.json({ ok: true, notified: 0 });
  }

  // ── Costruisci messaggio aggregato ────────────────────────────────
  const nextMonthName = firstOfNextMonth.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });

  const totalCents = dueCosts.reduce((s, c) => s + c.amountCents, 0);
  const lines = dueCosts.map(
    (c) => `• ${c.name} — ${formatEUR(c.amountCents)} (${FREQ_LABEL[c.frequency] ?? c.frequency})`,
  );

  const telegramText = [
    `📋 <b>Costi fissi in scadenza — ${nextMonthName}</b>`,
    "",
    ...lines,
    "",
    `<b>Totale: ${formatEUR(totalCents)}</b>`,
  ].join("\n");

  const emailBody = [
    `<p>I seguenti costi fissi sono in scadenza per <strong>${nextMonthName}</strong>:</p>`,
    "<ul>",
    ...dueCosts.map(
      (c) => `<li><strong>${c.name}</strong> — ${formatEUR(c.amountCents)} (${FREQ_LABEL[c.frequency] ?? c.frequency})</li>`,
    ),
    "</ul>",
    `<p style="margin-top:16px;font-size:16px;"><strong>Totale: ${formatEUR(totalCents)}</strong></p>`,
  ].join("\n");

  // ── Invio notifiche ───────────────────────────────────────────────
  const wantsTelegram = dueCosts.some((c) => c.notifyTelegram);
  const wantsEmail = dueCosts.some((c) => c.notifyEmail);

  // Leggi config notifiche
  const notifSnap = await adminDb.doc("settings/notifications").get();
  const notifData = notifSnap.data() ?? {};
  const telegramToken = (notifData["telegramBotToken"] as string) || process.env.TELEGRAM_BOT_TOKEN || "";
  const telegramChatId = (notifData["telegramChatId"] as string) || process.env.TELEGRAM_CHAT_ID || "";
  const notifyEmailAddr = (notifData["notifyEmail"] as string) || process.env.NOTIFY_EMAIL || "";

  let sentTelegram = false;
  let sentEmail = false;

  if (wantsTelegram && telegramToken && telegramChatId) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: telegramText,
          parse_mode: "HTML",
        }),
      });
      sentTelegram = res.ok;
      if (!res.ok) {
        logger.warn("Telegram cost reminder failed", { status: res.status });
      }
    } catch (err) {
      logger.error("Telegram cost reminder error", err);
    }
  }

  if (wantsEmail && notifyEmailAddr) {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(apiKey);
        const from = process.env.RESEND_FROM_EMAIL ?? "noreply@vinifera.app";
        await resend.emails.send({
          from,
          to: notifyEmailAddr,
          subject: `Costi fissi in scadenza — ${nextMonthName}`,
          text: dueCosts.map((c) => `${c.name}: ${formatEUR(c.amountCents)}`).join("\n") + `\nTotale: ${formatEUR(totalCents)}`,
          html: buildEmailHtml({
            title: `Costi fissi in scadenza — ${nextMonthName}`,
            body: emailBody,
          }),
        });
        sentEmail = true;
      } catch (err) {
        logger.error("Email cost reminder error", err);
      }
    }
  }

  logger.info("Cost reminders sent", {
    count: dueCosts.length,
    sentTelegram,
    sentEmail,
    daysUntilFirst,
    currentDay,
  });

  return NextResponse.json({
    ok: true,
    notified: dueCosts.length,
    sentTelegram,
    sentEmail,
  });
}
