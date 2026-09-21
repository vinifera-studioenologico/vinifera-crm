import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";

/**
 * Invia un messaggio Telegram usando la config di `settings/notifications`
 * (Firestore-first, fallback su TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID), con la
 * stessa precedenza già in uso in `src/app/api/costs/reminders/route.ts`.
 * Se le credenziali non sono configurate ritorna `false` senza lanciare: una
 * notifica non configurata non deve rompere il flusso chiamante.
 */
export async function sendTelegramMessage(text: string): Promise<boolean> {
  const snap = await adminDb.doc("settings/notifications").get();
  const data = snap.data() ?? {};
  const token = (data["telegramBotToken"] as string) || process.env.TELEGRAM_BOT_TOKEN || "";
  const chatId = (data["telegramChatId"] as string) || process.env.TELEGRAM_CHAT_ID || "";

  if (!token || !chatId) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      logger.warn("sendTelegramMessage failed", { status: res.status });
    }
    return res.ok;
  } catch (err) {
    logger.error("sendTelegramMessage error", err);
    return false;
  }
}
