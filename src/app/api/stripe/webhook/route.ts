export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe";
import { logger } from "@/lib/logger";
import { triggerSiteRevalidation } from "@/server/site-revalidation";
import { sendOrderConfirmationEmail } from "@/server/events-emails";
import { NotificationSettingsSchema } from "@/schemas/settings";
import {
  decidePaymentIntentSucceeded,
  decidePaymentIntentFailed,
  decidePaymentIntentCanceled,
  decideChargeRefunded,
  type OrderSnapshot,
  type EventSeats,
  type SideEffectType,
} from "./handlers";

// ── Helper: leggi ordine da Firestore ─────────────────────────────────
async function getOrderSnapshot(orderId: string): Promise<OrderSnapshot | null> {
  const snap = await adminDb.collection("eventOrders").doc(orderId).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return {
    id: snap.id,
    status: d["status"],
    seats: d["seats"] ?? 0,
    paymentIntentId: d["paymentIntentId"] ?? null,
    eventId: d["eventId"] ?? "",
    locale: d["locale"] ?? "it",
    buyer: d["buyer"] ?? {},
    eventSnapshot: d["eventSnapshot"] ?? {},
    orderNumber: d["orderNumber"] ?? "",
    totalCents: d["totalCents"] ?? 0,
    billing: d["billing"] ?? null,
  };
}

// ── Helper: leggi posti evento ────────────────────────────────────────
async function getEventSeats(eventId: string): Promise<EventSeats | null> {
  const snap = await adminDb.collection("events").doc(eventId).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return {
    capacity: d["capacity"] ?? 0,
    seatsSold: d["seatsSold"] ?? 0,
    seatsHeld: d["seatsHeld"] ?? 0,
  };
}

// ── Helper: applica patch con FieldValue ──────────────────────────────
function buildFirestorePatch(
  patch: Record<string, unknown>,
  type: "order" | "event",
): Record<string, unknown> {
  const result: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

  for (const [key, val] of Object.entries(patch)) {
    if (key === "seatsHeld_dec") {
      result["seatsHeld"] = FieldValue.increment(-(val as number));
    } else if (key === "seatsSold_inc") {
      result["seatsSold"] = FieldValue.increment(val as number);
    } else if (key === "seatsSold_dec") {
      result["seatsSold"] = FieldValue.increment(-(val as number));
    } else if (key === "paidAt" || key === "refundedAt") {
      result[key] = Timestamp.fromDate(val as Date);
    } else {
      result[key] = val;
    }
  }
  return result;
}

// ── Helper: esegui side effects ───────────────────────────────────────
async function executeSideEffects(
  effects: SideEffectType[],
  order: OrderSnapshot,
): Promise<void> {
  for (const effect of effects) {
    try {
      if (effect.type === "log_transaction") {
        await adminDb
          .collection("eventOrders")
          .doc(order.id)
          .collection("transactions")
          .add({
            stripeEventId: effect.stripeEventId,
            type: effect.txType,
            amountCents: effect.amountCents,
            summary: effect.summary,
            createdAt: FieldValue.serverTimestamp(),
          });
      } else if (effect.type === "send_confirmation_email") {
        const startsAtRaw = order.eventSnapshot.startsAt;
        const startsAtISO =
          startsAtRaw && typeof startsAtRaw === "object" && "toDate" in (startsAtRaw as object)
            ? (startsAtRaw as { toDate(): Date }).toDate().toISOString()
            : new Date().toISOString();

        await sendOrderConfirmationEmail({
          orderNumber: order.orderNumber,
          eventTitleIt: order.eventSnapshot.titleIt,
          eventStartsAt: startsAtISO,
          locationName: order.eventSnapshot.locationName,
          seats: order.seats,
          participants: [],
          buyerEmail: order.buyer.email,
          buyerFirstName: order.buyer.firstName,
          totalCents: order.totalCents,
          locale: order.locale,
        });
      } else if (effect.type === "auto_refund") {
        await getStripe().refunds.create({ payment_intent: effect.paymentIntentId });
      } else if (effect.type === "send_refund_email_sold_out") {
        // Email rimborso automatico per evento esaurito
        const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@vinifera.app";
        const apiKey = process.env.RESEND_API_KEY;
        if (apiKey) {
          const { Resend } = await import("resend");
          const resend = new Resend(apiKey);
          const isIt = order.locale === "it";
          await resend.emails
            .send({
              from: fromEmail,
              to: order.buyer.email,
              subject: isIt
                ? `Rimborso totale — ${order.eventSnapshot.titleIt}`
                : `Full refund — ${order.eventSnapshot.titleIt}`,
              html: isIt
                ? `<p>Il tuo pagamento è stato ricevuto ma l'evento è nel frattempo esaurito. Ti rimborsiamo immediatamente l'intero importo. Non è richiesta nessuna azione da parte tua.</p>`
                : `<p>Your payment was received, but the event sold out in the meantime. We are issuing a full refund immediately. No action is required on your part.</p>`,
            })
            .catch(console.error);
        }
      } else if (effect.type === "trigger_revalidation") {
        triggerSiteRevalidation("events");
      } else if (effect.type === "notify_admin_paid") {
        const snap = await adminDb.doc("settings/notifications").get();
        const config = NotificationSettingsSchema.safeParse(snap.data() ?? {});
        if (
          config.success &&
          config.data.telegramBotToken &&
          config.data.telegramChatId
        ) {
          fetch(
            `https://api.telegram.org/bot${config.data.telegramBotToken}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: config.data.telegramChatId,
                text: `✅ Nuovo ordine pagato\n<b>${order.eventSnapshot.titleIt}</b>\n${order.seats} posti — ${order.orderNumber}`,
                parse_mode: "HTML",
              }),
            },
          ).catch(console.error);
        }
      }
    } catch (err) {
      logger.error(`[Webhook] side effect ${effect.type} fallito`, err);
    }
  }
}

// ── Route handler ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 });
  }

  const rawBody = await req.text();

  type StripeEventShape = {
    id: string;
    type: string;
    data: { object: Record<string, unknown> };
  };

  let stripeEvent: StripeEventShape;

  try {
    stripeEvent = getStripe().webhooks.constructEvent(rawBody, sig, secret) as unknown as StripeEventShape;
  } catch (err) {
    logger.warn("[Webhook] Firma Stripe non valida", { err });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const { id: stripeEventId, type, data } = stripeEvent;
  const obj = data.object;

  logger.info(`[Webhook] ${type}`, { stripeEventId });

  try {
    if (type === "payment_intent.succeeded") {
      await handlePaymentIntentSucceeded(obj, stripeEventId);
    } else if (type === "payment_intent.payment_failed") {
      await handlePaymentIntentFailed(obj, stripeEventId);
    } else if (type === "payment_intent.canceled") {
      await handlePaymentIntentCanceled(obj, stripeEventId);
    } else if (type === "charge.refunded") {
      await handleChargeRefunded(obj, stripeEventId);
    }
    // Tutti gli altri eventi: ignora silenziosamente
  } catch (err) {
    logger.error(`[Webhook] Errore handler ${type}`, err);
    // Rispondo 200 per evitare che Stripe ritenti — errori vengono loggati
  }

  return NextResponse.json({ received: true });
}

// ── Handler specifici ─────────────────────────────────────────────────

async function handlePaymentIntentSucceeded(
  pi: Record<string, unknown>,
  stripeEventId: string,
): Promise<void> {
  const orderId = (pi["metadata"] as Record<string, string> | undefined)?.["orderId"];
  if (!orderId) return;

  const [order, eventSeats] = await Promise.all([
    getOrderSnapshot(orderId),
    (async () => {
      const ev = await adminDb
        .collection("eventOrders")
        .doc(orderId)
        .get()
        .then((s) => s.data()?.["eventId"] as string | undefined);
      return ev ? getEventSeats(ev) : null;
    })(),
  ]);

  if (!order) { logger.warn(`[Webhook] Ordine non trovato: ${orderId}`); return; }
  if (!eventSeats) { logger.warn(`[Webhook] Evento non trovato per ordine: ${orderId}`); return; }

  const decision = decidePaymentIntentSucceeded(
    order,
    eventSeats,
    stripeEventId,
    (pi["amount_received"] as number | undefined) ?? 0,
    new Date(),
  );

  await applyDecision(orderId, order.eventId, decision);
  await executeSideEffects(decision.sideEffects, order);
}

async function handlePaymentIntentFailed(
  pi: Record<string, unknown>,
  stripeEventId: string,
): Promise<void> {
  const orderId = (pi["metadata"] as Record<string, string> | undefined)?.["orderId"];
  if (!orderId) return;

  const order = await getOrderSnapshot(orderId);
  if (!order) return;

  const errorMessage =
    (pi["last_payment_error"] as Record<string, string> | undefined)?.["message"] ?? null;

  const decision = decidePaymentIntentFailed(order, stripeEventId, errorMessage);
  await applyDecision(orderId, order.eventId, decision);
  await executeSideEffects(decision.sideEffects, order);
}

async function handlePaymentIntentCanceled(
  pi: Record<string, unknown>,
  stripeEventId: string,
): Promise<void> {
  const orderId = (pi["metadata"] as Record<string, string> | undefined)?.["orderId"];
  if (!orderId) return;

  const order = await getOrderSnapshot(orderId);
  if (!order) return;

  const decision = decidePaymentIntentCanceled(order, stripeEventId);
  await applyDecision(orderId, order.eventId, decision);
  await executeSideEffects(decision.sideEffects, order);
}

async function handleChargeRefunded(
  charge: Record<string, unknown>,
  stripeEventId: string,
): Promise<void> {
  // Recupera orderId dalla metadata del payment_intent collegato
  const piId = charge["payment_intent"] as string | undefined;
  if (!piId) return;

  const piData = await getStripe().paymentIntents.retrieve(piId);
  const orderId = piData.metadata?.["orderId"];
  if (!orderId) return;

  const order = await getOrderSnapshot(orderId);
  if (!order) return;

  const refundObj = (charge["refunds"] as { data?: Array<{ id: string; amount: number }> } | undefined)?.data?.[0];
  const refundId = refundObj?.id ?? "unknown";
  const amountCents = refundObj?.amount ?? (charge["amount_refunded"] as number | undefined) ?? 0;

  const decision = decideChargeRefunded(order, stripeEventId, refundId, amountCents);
  await applyDecision(orderId, order.eventId, decision);
  await executeSideEffects(decision.sideEffects, order);
}

// ── Helper: applica decision al DB ────────────────────────────────────
async function applyDecision(
  orderId: string,
  eventId: string,
  decision: { orderPatch: Record<string, unknown> | null; eventPatch: Record<string, unknown> | null },
): Promise<void> {
  if (!decision.orderPatch && !decision.eventPatch) return;

  await adminDb.runTransaction(async (tx) => {
    if (decision.orderPatch) {
      const orderRef = adminDb.collection("eventOrders").doc(orderId);
      tx.update(orderRef, buildFirestorePatch(decision.orderPatch, "order"));
    }
    if (decision.eventPatch) {
      const eventRef = adminDb.collection("events").doc(eventId);
      tx.update(eventRef, buildFirestorePatch(decision.eventPatch, "event"));
    }
  });
}
