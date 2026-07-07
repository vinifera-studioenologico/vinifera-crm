import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { IncomingLeadValues } from "@/schemas/lead";
import type { ActionResult } from "@/types";
import { NotificationSettingsSchema } from "@/schemas/settings";
import { buildEmailHtml } from "@/lib/email";

export async function createLeadFromWebsite(
  data: IncomingLeadValues,
): Promise<ActionResult<{ id: string }>> {
  try {
    const source = data.source === "whatsapp" ? "website_whatsapp" : "website_form";

    // IMPORTANTE: Firestore lancia se un campo è `undefined`
    // Costruire il doc includendo solo i campi valorizzati.
    const doc: Record<string, unknown> = {
      name: data.name,
      phone: data.phone,
      serviceId: data.service_id,
      serviceTitle: data.service_title,
      source,
      status: "new",
      locale: data.locale,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (data.email) doc["email"] = data.email;
    if (data.message) doc["message"] = data.message;
    if (data.page_url) doc["pageUrl"] = data.page_url;
    if (data.utm_source) doc["utmSource"] = data.utm_source;
    if (data.utm_medium) doc["utmMedium"] = data.utm_medium;
    if (data.utm_campaign) doc["utmCampaign"] = data.utm_campaign;
    if (data.posthog_distinct_id) doc["posthogDistinctId"] = data.posthog_distinct_id;
    if (data.posthog_session_id) doc["posthogSessionId"] = data.posthog_session_id;

    const ref = await adminDb.collection("leads").add(doc);

    // Fire-and-forget: notifica in background, non blocca la risposta API
    notifyNewLead(data).catch((err) =>
      console.error("[createLeadFromWebsite] notification error:", err),
    );

    return { success: true, data: { id: ref.id } };
  } catch (error) {
    console.error("[createLeadFromWebsite] error:", error);
    return { success: false, error: "Impossibile salvare il lead" };
  }
}

/**
 * Invia notifiche Telegram/Email per un nuovo lead.
 * Fire-and-forget: gli errori vengono loggati ma non bloccano la risposta API.
 */
async function notifyNewLead(data: IncomingLeadValues): Promise<void> {
  try {
    const snap = await adminDb.doc("settings/notifications").get();
    const config = NotificationSettingsSchema.safeParse(snap.data() ?? {});
    if (!config.success) return;
    const settings = config.data;

    const sourceLabel = data.source === "whatsapp" ? "WhatsApp" : "Form";
    const crmUrl =
      process.env.CRM_BASE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    // ── Telegram ──────────────────────────────────────────
    if (settings.notifyNewLeadTelegram) {
      const token = settings.telegramBotToken;
      const chatId = settings.telegramChatId;
      if (token && chatId) {
        const text = [
          "🔔 <b>Nuovo lead dal sito</b>",
          "",
          `👤 <b>Nome:</b> ${escHtml(data.name)}`,
          `📞 <b>Tel:</b> ${escHtml(data.phone)}`,
          `📧 <b>Email:</b> ${data.email || "—"}`,
          `🔧 <b>Servizio:</b> ${escHtml(data.service_title)}`,
          `📱 <b>Fonte:</b> ${sourceLabel}`,
          `🌐 <b>Lingua:</b> ${data.locale.toUpperCase()}`,
          data.message ? `\n💬 ${escHtml(data.message)}` : "",
          "",
          `→ <a href="${crmUrl}/leads">Gestisci nel CRM</a>`,
        ]
          .filter(Boolean)
          .join("\n");

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
        }).catch((err) => console.error("[notifyNewLead] Telegram error:", err));
      }
    }

    // ── Email ─────────────────────────────────────────────
    if (settings.notifyNewLeadEmail) {
      const to = settings.notifyEmail;
      const apiKey = process.env.RESEND_API_KEY;
      if (to && apiKey) {
        const body = `
          <p>Un nuovo lead è stato ricevuto dal sito web.</p>
          <table style="border-collapse:collapse;width:100%;">
            <tr><td style="padding:6px 12px;color:#666;">Nome</td><td style="padding:6px 12px;font-weight:600;">${escHtml(data.name)}</td></tr>
            <tr><td style="padding:6px 12px;color:#666;">Telefono</td><td style="padding:6px 12px;font-weight:600;"><a href="tel:${escHtml(data.phone)}">${escHtml(data.phone)}</a></td></tr>
            ${data.email ? `<tr><td style="padding:6px 12px;color:#666;">Email</td><td style="padding:6px 12px;"><a href="mailto:${escHtml(data.email)}">${escHtml(data.email)}</a></td></tr>` : ""}
            <tr><td style="padding:6px 12px;color:#666;">Servizio</td><td style="padding:6px 12px;">${escHtml(data.service_title)}</td></tr>
            <tr><td style="padding:6px 12px;color:#666;">Fonte</td><td style="padding:6px 12px;">${sourceLabel}</td></tr>
            <tr><td style="padding:6px 12px;color:#666;">Lingua</td><td style="padding:6px 12px;">${data.locale.toUpperCase()}</td></tr>
            ${data.message ? `<tr><td style="padding:6px 12px;color:#666;">Messaggio</td><td style="padding:6px 12px;">${escHtml(data.message)}</td></tr>` : ""}
          </table>
          <p style="margin-top:20px;"><a href="${crmUrl}/leads" style="display:inline-block;padding:10px 20px;background:#145a44;color:white;text-decoration:none;border-radius:6px;">Gestisci nel CRM</a></p>
        `;

        const { Resend } = await import("resend");
        const resend = new Resend(apiKey);
        await resend.emails
          .send({
            from: process.env.RESEND_FROM_EMAIL ?? "noreply@vinifera.app",
            to,
            subject: `Nuovo lead: ${data.name} — ${data.service_title}`,
            html: buildEmailHtml({ title: "Nuovo lead dal sito", body }),
          })
          .catch((err) => console.error("[notifyNewLead] Email error:", err));
      }
    }
  } catch (err) {
    console.error("[notifyNewLead] unexpected error:", err);
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
