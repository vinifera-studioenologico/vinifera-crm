import { type NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";
import { buildEmailHtml } from "@/lib/email";
import {
  derivePaymentStatus,
  type InstallmentForCalc,
} from "@/lib/calc/payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Protetto da Authorization: Bearer <CRON_SECRET> (iniettato da Vercel automaticamente)
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

// ── Invia notifica Telegram ───────────────────────────────────────────
async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

// ── Invia notifica Email via Resend ───────────────────────────────────
async function sendEmail(
  to: string,
  subject: string,
  text: string,
  htmlBody?: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return;
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "noreply@vinifera.app",
    to,
    subject,
    text,
    html: htmlBody,
  });
}

// ── Carica config notifiche da Firestore ──────────────────────────────
async function loadNotifConfig() {
  const snap = await adminDb.doc("settings/notifications").get();
  const d = snap.data() ?? {};
  return {
    telegramToken:
      (d["telegramBotToken"] as string | undefined) ||
      process.env.TELEGRAM_BOT_TOKEN ||
      "",
    telegramChatId:
      (d["telegramChatId"] as string | undefined) ||
      process.env.TELEGRAM_CHAT_ID ||
      "",
    notifyEmail:
      (d["notifyEmail"] as string | undefined) ||
      process.env.NOTIFY_EMAIL ||
      "",
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Timestamp.now();
  const COL = "reminders";

  try {
    const notif = await loadNotifConfig();
    // Trova promemoria pending con dueAt passato e non ancora notificati
    const snap = await adminDb
      .collection(COL)
      .where("status", "==", "pending")
      .where("notifiedAt", "==", null)
      .get();

    const toNotify = snap.docs.filter((doc) => {
      const d = doc.data();
      const dueAt = d["dueAt"] as Timestamp | null;
      if (!dueAt) return false;
      const remindBefore = (d["remindBeforeMinutes"] as number | null) ?? 0;
      const notifyAt = new Date(dueAt.toDate().getTime() - remindBefore * 60 * 1000);
      return notifyAt.getTime() <= now.toDate().getTime();
    });

    let notified = 0;

    for (const doc of toNotify) {
      const d = doc.data();
      const title = d["title"] as string;
      const description = d["description"] as string | null;
      const channels = d["notifyChannels"] as
        | { telegram: boolean; email: boolean }
        | null;
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
        description ? description : null,
        `📅 Scade: ${dueDateStr}`,
      ]
        .filter(Boolean)
        .join("\n");

      try {
        if (channels?.telegram) {
          await sendTelegram(notif.telegramToken, notif.telegramChatId, messageText);
        }
        if (channels?.email) {
          const emailHtml = buildEmailHtml({
            title: `Promemoria: ${title}`,
            body: [
              description ? `<p>${description}</p>` : "",
              `<p>📅 <strong>Scadenza:</strong> ${dueDateStr}</p>`,
            ]
              .filter(Boolean)
              .join(""),
          });
          await sendEmail(
            notif.notifyEmail,
            `Promemoria: ${title}`,
            `${title}\n${description ?? ""}\nScade: ${dueDateStr}`,
            emailHtml,
          );
        }

        // Marca come notificato
        await doc.ref.update({
          notifiedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        notified++;
      } catch (err) {
        logger.error("Notification failed for reminder", { id: doc.id, err });
      }
    }

    // ── Aggiorna overdue installments (cron giornaliero) ──────────────
    const cutoff = Timestamp.fromDate(new Date(now.toDate().setHours(0, 0, 0, 0)));
    const overdueInstallSnap = await adminDb
      .collectionGroup("installments")
      .where("status", "==", "pending")
      .where("dueAt", "<", cutoff)
      .get();

    const batch = adminDb.batch();
    const paymentIds = new Set<string>();

    for (const instDoc of overdueInstallSnap.docs) {
      batch.update(instDoc.ref, {
        status: "overdue",
        updatedAt: FieldValue.serverTimestamp(),
      });
      // Raccoglie paymentId padre
      const paymentId = instDoc.ref.parent.parent?.id;
      if (paymentId) paymentIds.add(paymentId);
    }

    if (overdueInstallSnap.docs.length > 0) await batch.commit();

    // Aggiorna status pagamento usando derivePaymentStatus
    for (const paymentId of paymentIds) {
      const payRef = adminDb.collection("payments").doc(paymentId);
      const [paySnap, installSnap] = await Promise.all([
        payRef.get(),
        adminDb
          .collection("payments")
          .doc(paymentId)
          .collection("installments")
          .get(),
      ]);
      if (!paySnap.exists) continue;
      const payData = paySnap.data()!;
      const currentPayStatus = payData["status"] as string;
      // Non toccare pagamenti già terminali
      if (currentPayStatus === "paid" || currentPayStatus === "cancelled") continue;

      const installmentsForCalc: InstallmentForCalc[] = installSnap.docs.map((d) => ({
        // Rate overdue appena aggiornate in batch — considerale già overdue
        status: overdueInstallSnap.docs.some((od) => od.id === d.id)
          ? "overdue"
          : (d.data()["status"] as InstallmentForCalc["status"]),
        dueDate: (d.data()["dueAt"] as Timestamp).toDate(),
        amountCents: (d.data()["amountCents"] as number) ?? 0,
      }));

      const newStatus = derivePaymentStatus(
        {
          totalAmountCents: (payData["totalAmountCents"] as number) ?? 0,
          paidAmountCents: (payData["paidAmountCents"] as number) ?? 0,
          cancelled: false,
        },
        installmentsForCalc,
      );

      if (newStatus !== currentPayStatus) {
        await payRef.update({
          status: newStatus,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    logger.info("Cron reminders completed", {
      notified,
      overdueInstallments: overdueInstallSnap.docs.length,
    });

    return NextResponse.json({
      ok: true,
      notified,
      overdueInstallments: overdueInstallSnap.docs.length,
    });
  } catch (err) {
    logger.error("Cron reminders failed", { err });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
