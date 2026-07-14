import "server-only";

import { buildEmailHtml } from "@/lib/email";
import { formatEUR } from "@/lib/utils/money";
import { format } from "date-fns";
import { it as itLocale, enUS } from "date-fns/locale";

export interface OrderEmailData {
  orderNumber: string;
  eventTitleIt: string;
  eventStartsAt: string; // ISO
  locationName: string;
  seats: number;
  participants: Array<{ firstName: string; lastName: string }>;
  buyerEmail: string;
  buyerFirstName: string;
  totalCents: number;
  locale: "it" | "en";
}

function formatEventDate(iso: string, locale: "it" | "en"): string {
  try {
    const d = new Date(iso);
    return format(d, "d MMMM yyyy, HH:mm", {
      locale: locale === "it" ? itLocale : enUS,
    });
  } catch {
    return iso;
  }
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Invia email di conferma ordine all'acquirente.
 * Usata sia dal ramo gratuito (M3) sia dal webhook Stripe (M4) — template unico.
 * Se totalCents === 0 il template NON menziona pagamenti né ricevute.
 */
export async function sendOrderConfirmationEmail(order: OrderEmailData): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@vinifera.app";
  if (!apiKey) {
    console.log("[Events Email] RESEND_API_KEY non configurato, email non inviata");
    return;
  }

  const isFree = order.totalCents === 0;
  const eventDate = formatEventDate(order.eventStartsAt, order.locale);

  const participantRows = order.participants
    .map(
      (p, i) =>
        `<tr><td style="padding:4px 8px;color:#666;">${i + 1}.</td>` +
        `<td style="padding:4px 8px;">${escHtml(p.firstName)} ${escHtml(p.lastName)}</td></tr>`,
    )
    .join("");

  const isIt = order.locale === "it";

  const subject = isIt
    ? `Prenotazione confermata — ${order.eventTitleIt}`
    : `Booking confirmed — ${order.eventTitleIt}`;

  const totalLine = isFree
    ? `<p style="margin:0;font-size:14px;">${isIt ? "Totale" : "Total"}: <strong>${isIt ? "Gratuito" : "Free"}</strong></p>`
    : `<p style="margin:0;font-size:14px;">${isIt ? "Totale" : "Total"}: <strong>${formatEUR(order.totalCents)}</strong></p>`;

  const paymentNote = isFree
    ? ""
    : `<p style="margin:8px 0 0;font-size:12px;color:#9ca3af;">${isIt ? "Riceverai la ricevuta di pagamento da Stripe." : "You will receive the payment receipt from Stripe."}</p>`;

  const body = `
    <p>${isIt ? `Ciao ${escHtml(order.buyerFirstName)},` : `Hi ${escHtml(order.buyerFirstName)},`}</p>
    <p>${isIt ? "La tua prenotazione è confermata!" : "Your booking is confirmed!"}</p>

    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:6px 0;color:#666;font-size:13px;">${isIt ? "Numero ordine" : "Order number"}</td><td style="padding:6px 0;font-weight:600;">${escHtml(order.orderNumber)}</td></tr>
      <tr><td style="padding:6px 0;color:#666;font-size:13px;">${isIt ? "Evento" : "Event"}</td><td style="padding:6px 0;font-weight:600;">${escHtml(order.eventTitleIt)}</td></tr>
      <tr><td style="padding:6px 0;color:#666;font-size:13px;">${isIt ? "Data" : "Date"}</td><td style="padding:6px 0;">${eventDate}</td></tr>
      <tr><td style="padding:6px 0;color:#666;font-size:13px;">${isIt ? "Luogo" : "Location"}</td><td style="padding:6px 0;">${escHtml(order.locationName)}</td></tr>
      <tr><td style="padding:6px 0;color:#666;font-size:13px;">${isIt ? "Posti" : "Seats"}</td><td style="padding:6px 0;">${order.seats}</td></tr>
    </table>

    ${
      order.participants.length > 0
        ? `<p style="margin:12px 0 6px;font-size:13px;font-weight:600;color:#374151;">${isIt ? "Partecipanti" : "Participants"}:</p>
           <table style="width:100%;border-collapse:collapse;font-size:13px;">${participantRows}</table>`
        : ""
    }

    <div style="margin:16px 0;padding:12px;background:#f9fafb;border-radius:8px;">
      ${totalLine}
      ${paymentNote}
    </div>
  `;

  const html = buildEmailHtml({
    title: subject,
    body,
    footerNote: isIt
      ? "Non rispondere a questa email — per assistenza scrivici su WhatsApp."
      : "Do not reply to this email — for support, contact us on WhatsApp.",
  });

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  await resend.emails
    .send({
      from: fromEmail,
      to: order.buyerEmail,
      subject,
      html,
    })
    .catch((err) => console.error("[Events Email] Send error:", err));
}
