"use server";

import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

import { adminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import { buildEmailHtml } from "@/lib/email";
import { formatEUR } from "@/lib/utils/money";
import { triggerSiteRevalidation } from "@/server/site-revalidation";
import type { ActionResult } from "@/types";
import { tsToISO } from "@/lib/utils/date";
import { groupOrdersByBuyer, type OrderForHistory } from "@/server/actions/event-buyers-logic";
import { computeEventStats, aggregateStatsByMonth, type OrderForStats } from "@/server/actions/event-stats-logic";

// ── Rimborso manuale singolo ordine a pagamento ───────────────────────
export async function refundOrder(orderId: string): Promise<ActionResult<void>> {
  await requireAdmin();

  try {
    const orderSnap = await adminDb.collection("eventOrders").doc(orderId).get();
    if (!orderSnap.exists) return { success: false, error: "Ordine non trovato" };

    const data = orderSnap.data()!;
    if (data["status"] !== "paid") {
      return { success: false, error: "L'ordine non è in stato pagato — impossibile rimborsare." };
    }
    if (!data["paymentIntentId"]) {
      return { success: false, error: "Nessun PaymentIntent associato. Usa 'Annulla prenotazione' per gli ordini gratuiti." };
    }

    // Stripe refund — lo stato dell'ordine verrà aggiornato dal webhook charge.refunded (M4)
    await getStripe().refunds.create({ payment_intent: data["paymentIntentId"] });

    logger.info("Rimborso Stripe avviato", { orderId, pi: data["paymentIntentId"] });
    return { success: true, data: undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore durante il rimborso.";
    logger.error("Errore rimborso ordine", { orderId, err });
    return { success: false, error: msg };
  }
}

// ── Annullamento diretto ordine gratuito ──────────────────────────────
export async function cancelFreeOrder(orderId: string): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    const orderSnap = await adminDb.collection("eventOrders").doc(orderId).get();
    if (!orderSnap.exists) return { success: false, error: "Ordine non trovato" };

    const data = orderSnap.data()!;
    if (data["status"] !== "paid") {
      return { success: false, error: "L'ordine non è in stato pagato." };
    }
    if (data["paymentIntentId"]) {
      return { success: false, error: "Questo ordine è a pagamento. Usa 'Rimborsa' invece di 'Annulla prenotazione'." };
    }

    const eventId: string = data["eventId"];
    const seats: number = data["seats"] ?? 0;

    await adminDb.runTransaction(async (tx) => {
      const orderRef = adminDb.collection("eventOrders").doc(orderId);
      const evRef = adminDb.collection("events").doc(eventId);

      // Idempotenza: verifica che non sia già cancellato
      const fresh = await tx.get(orderRef);
      if (fresh.data()?.["status"] === "cancelled") return;

      tx.update(orderRef, {
        status: "cancelled",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
      tx.update(evRef, {
        seatsSold: FieldValue.increment(-seats),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    // Email annullo (fire-and-forget)
    sendCancelEmail(data).catch((err) => logger.error("Email annullo fallita", err));

    triggerSiteRevalidation("events");
    revalidatePath(`/events/${eventId}`);

    logger.info("Ordine gratuito annullato", { orderId, eventId });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore annullamento ordine gratuito", { orderId, err });
    return { success: false, error: "Errore durante l'annullamento. Riprova." };
  }
}

// ── Helper email annullo ordine gratuito ─────────────────────────────
async function sendCancelEmail(data: FirebaseFirestore.DocumentData): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@vinifera.app";
  if (!apiKey) return;

  const locale: "it" | "en" = data["locale"] ?? "it";
  const isIt = locale === "it";
  const buyer = data["buyer"] as { firstName: string; email: string };
  const titleIt = data["eventSnapshot"]?.titleIt ?? "";
  const orderNumber = data["orderNumber"] ?? "";

  const subject = isIt
    ? `Prenotazione annullata — ${titleIt}`
    : `Booking cancelled — ${titleIt}`;

  const html = buildEmailHtml({
    title: subject,
    body: isIt
      ? `<p>Ciao ${buyer.firstName},</p><p>La tua prenotazione <strong>${orderNumber}</strong> è stata annullata.</p>`
      : `<p>Hi ${buyer.firstName},</p><p>Your booking <strong>${orderNumber}</strong> has been cancelled.</p>`,
  });

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  await resend.emails.send({ from: fromEmail, to: buyer.email, subject, html }).catch(console.error);
}

// ── Rimborso email ordine a pagamento (usata da cancelEventWithRefunds) ─
export async function sendRefundEmail(
  data: FirebaseFirestore.DocumentData,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@vinifera.app";
  if (!apiKey) return;

  const locale: "it" | "en" = data["locale"] ?? "it";
  const isIt = locale === "it";
  const buyer = data["buyer"] as { firstName: string; email: string };
  const titleIt = data["eventSnapshot"]?.titleIt ?? "";
  const totalCents = data["totalCents"] ?? 0;

  const subject = isIt
    ? `Evento cancellato — rimborso in arrivo per ${titleIt}`
    : `Event cancelled — refund on its way for ${titleIt}`;

  const html = buildEmailHtml({
    title: subject,
    body: isIt
      ? `<p>Ciao ${buyer.firstName},</p><p>L'evento <strong>${titleIt}</strong> è stato cancellato. Riceverai il rimborso totale di <strong>${formatEUR(totalCents)}</strong> entro pochi giorni lavorativi.</p>`
      : `<p>Hi ${buyer.firstName},</p><p>The event <strong>${titleIt}</strong> has been cancelled. You will receive a full refund of <strong>${formatEUR(totalCents)}</strong> within a few business days.</p>`,
  });

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  await resend.emails.send({ from: fromEmail, to: buyer.email, subject, html }).catch(console.error);
}

// ── Tipo ordine CRM per l'UI ──────────────────────────────────────────
export interface EventOrderSummary {
  id: string;
  orderNumber: string;
  eventId: string;
  status: string;
  seats: number;
  totalCents: number;
  unitPriceCents: number;
  buyer: {
    firstName: string;
    lastName: string;
    email: string;
    emailNormalized: string;
    phone: string;
    phoneNormalized: string;
  };
  participants: Array<{ firstName: string; lastName: string }>;
  billing: unknown | null;
  paymentIntentId: string | null;
  holdExpiresAt: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  refundId: string | null;
  historyConsent: { granted: boolean; at: string | null };
  locale: "it" | "en";
  createdAt: string | undefined;
  updatedAt: string | undefined;
}

function toOrderSummary(
  id: string,
  data: FirebaseFirestore.DocumentData,
): EventOrderSummary {
  return {
    id,
    orderNumber: data["orderNumber"] ?? "",
    eventId: data["eventId"] ?? "",
    status: data["status"] ?? "unknown",
    seats: data["seats"] ?? 0,
    totalCents: data["totalCents"] ?? 0,
    unitPriceCents: data["unitPriceCents"] ?? 0,
    buyer: data["buyer"] ?? {},
    participants: data["participants"] ?? [],
    billing: data["billing"] ?? null,
    paymentIntentId: data["paymentIntentId"] ?? null,
    holdExpiresAt: tsToISO(data["holdExpiresAt"]) ?? null,
    paidAt: tsToISO(data["paidAt"]) ?? null,
    refundedAt: tsToISO(data["refundedAt"]) ?? null,
    refundId: data["refundId"] ?? null,
    historyConsent: {
      granted: data["historyConsent"]?.["granted"] ?? false,
      at: tsToISO(data["historyConsent"]?.["at"]) ?? null,
    },
    locale: data["locale"] ?? "it",
    createdAt: tsToISO(data["createdAt"]),
    updatedAt: tsToISO(data["updatedAt"]),
  };
}

// ── Lista ordini per evento ───────────────────────────────────────────
export async function getEventOrders(eventId: string): Promise<EventOrderSummary[]> {
  await requireAdmin();

  const snap = await adminDb
    .collection("eventOrders")
    .where("eventId", "==", eventId)
    .orderBy("createdAt", "desc")
    .get();

  return snap.docs.map((d) => toOrderSummary(d.id, d.data()));
}

// ── Storico acquirenti ────────────────────────────────────────────────
export async function getBuyersHistory() {
  await requireAdmin();

  const snap = await adminDb
    .collection("eventOrders")
    .where("historyConsent.granted", "==", true)
    .get();

  const orders: OrderForHistory[] = (snap.docs
    .map((d) => {
      const data = d.data();
      const status = data["status"] as string;
      if (!["paid", "refunded", "cancelled"].includes(status)) return null;
      return {
        id: d.id,
        status: status as "paid" | "refunded" | "cancelled",
        eventId: data["eventId"] ?? "",
        eventTitleIt: data["eventSnapshot"]?.titleIt ?? "",
        seats: data["seats"] ?? 0,
        totalCents: data["totalCents"] ?? 0,
        paidAt: tsToISO(data["paidAt"]) ?? null,
        createdAt: tsToISO(data["createdAt"]) ?? null,
        buyer: {
          firstName: data["buyer"]?.firstName ?? "",
          lastName: data["buyer"]?.lastName ?? "",
          emailNormalized: data["buyer"]?.emailNormalized ?? "",
          phoneNormalized: data["buyer"]?.phoneNormalized ?? "",
        },
        historyConsent: {
          granted: data["historyConsent"]?.["granted"] ?? false,
        },
      };
    })
    .filter(Boolean)) as OrderForHistory[];

  return groupOrdersByBuyer(orders);
}

// ── Statistiche entrate eventi ────────────────────────────────────────
export async function getEventsRevenueStats(opts: { year?: number } = {}) {
  await requireAdmin();

  const year = opts.year ?? new Date().getFullYear();

  const eventsSnap = await adminDb
    .collection("events")
    .where("deletedAt", "==", null)
    .get();

  const eventsMap = new Map<string, { title: string; capacity: number }>();
  for (const evDoc of eventsSnap.docs) {
    const d = evDoc.data();
    eventsMap.set(evDoc.id, {
      title: d["title"]?.it ?? evDoc.id,
      capacity: d["capacity"] ?? 0,
    });
  }

  const ordersSnap = await adminDb
    .collection("eventOrders")
    .where("status", "in", ["paid", "refunded", "cancelled"])
    .get();

  const orders: OrderForStats[] = (ordersSnap.docs
    .map((d) => {
      const data = d.data();
      const paidAtISO = tsToISO(data["paidAt"]) ?? null;

      if (paidAtISO && new Date(paidAtISO).getFullYear() !== year) return null;

      const ev = eventsMap.get(data["eventId"] ?? "");
      return {
        id: d.id,
        eventId: data["eventId"] ?? "",
        eventTitle: ev?.title ?? data["eventSnapshot"]?.titleIt ?? "",
        eventCapacity: ev?.capacity ?? 0,
        status: data["status"] as "paid" | "refunded" | "cancelled",
        totalCents: data["totalCents"] ?? 0,
        seats: data["seats"] ?? 0,
        priceCents: data["unitPriceCents"] ?? 0,
        paidAt: paidAtISO,
      };
    })
    .filter(Boolean)) as OrderForStats[];

  const byEvent = computeEventStats(orders);
  const byMonth = aggregateStatsByMonth(orders);
  const totalNetCents = byMonth.reduce((s, m) => s + m.netCents, 0);
  const totalParticipants = byMonth.reduce((s, m) => s + m.participants, 0);
  const totalOrders = byMonth.reduce((s, m) => s + m.orderCount, 0);

  return {
    year,
    byEvent,
    byMonth,
    totals: { netCents: totalNetCents, participants: totalParticipants, orders: totalOrders },
  };
}

// ── Prenotazione manuale (es. da telefono) ────────────────────────────
export interface ManualOrderInput {
  seats: number;
  buyer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  participants: Array<{ firstName: string; lastName: string }>;
  totalCents: number;        // 0 = gratuito/omaggio; altrimenti importo già riscosso
  paymentNote: string;       // es. "Pagato in contanti", "Bonifico ricevuto"
  historyConsent: boolean;
}

export async function createManualOrder(
  eventId: string,
  input: ManualOrderInput,
): Promise<ActionResult<{ orderNumber: string }>> {
  const actor = await requireAdmin();

  try {
    const evSnap = await adminDb.collection("events").doc(eventId).get();
    if (!evSnap.exists) return { success: false, error: "Evento non trovato" };

    const evData = evSnap.data()!;
    const year = new Date().getFullYear();
    let orderNumber = "";

    await adminDb.runTransaction(async (tx) => {
      const evRef = adminDb.collection("events").doc(eventId);
      const freshSnap = await tx.get(evRef);
      const fresh = freshSnap.data()!;

      const seatsSold: number = fresh["seatsSold"] ?? 0;
      const seatsHeld: number = fresh["seatsHeld"] ?? 0;
      const capacity: number = fresh["capacity"] ?? 0;
      if (capacity - seatsSold - seatsHeld < input.seats) {
        throw new Error("Posti insufficienti");
      }

      // Contatore ordini
      const counterRef = adminDb.doc(`counters/eventOrders-${year}`);
      const counterSnap = await tx.get(counterRef);
      const next = (counterSnap.data()?.["seq"] ?? 0) + 1;
      tx.set(counterRef, { seq: next }, { merge: true });
      orderNumber = `EVT-${year}-${String(next).padStart(4, "0")}`;

      const orderRef = adminDb.collection("eventOrders").doc();
      tx.set(orderRef, {
        orderNumber,
        eventId,
        eventSnapshot: {
          slug: evData["slug"] ?? "",
          titleIt: evData["title"]?.it ?? "",
          startsAt: evData["startsAt"],
          locationName: evData["location"]?.name ?? "",
        },
        seats: input.seats,
        unitPriceCents: input.seats > 0 ? Math.round(input.totalCents / input.seats) : 0,
        totalCents: input.totalCents,
        status: "paid",
        buyer: {
          firstName: input.buyer.firstName,
          lastName: input.buyer.lastName,
          email: input.buyer.email,
          emailNormalized: input.buyer.email.trim().toLowerCase(),
          phone: input.buyer.phone,
          phoneNormalized: input.buyer.phone.replace(/\D/g, ""),
        },
        participants: input.participants,
        billing: null,
        historyConsent: { granted: input.historyConsent, at: input.historyConsent ? Timestamp.now() : null },
        locale: "it",
        holdExpiresAt: null,
        paymentIntentId: null,      // nessun Stripe — pagamento già riscosso
        paidAt: FieldValue.serverTimestamp(),
        refundedAt: null,
        refundId: null,
        ip: null,
        notes: input.paymentNote,   // canale/metodo di pagamento
        source: "manual",           // marca come prenotazione manuale
        createdBy: actor.uid,
        version: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        deletedAt: null,
      });

      tx.update(evRef, {
        seatsSold: FieldValue.increment(input.seats),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/orders`);
    triggerSiteRevalidation("events");
    logger.info("Prenotazione manuale creata", { eventId, orderNumber, uid: actor.uid });

    return { success: true, data: { orderNumber } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore durante la registrazione.";
    logger.error("Errore prenotazione manuale", { eventId, err });
    return { success: false, error: msg };
  }
}
