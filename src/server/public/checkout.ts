import "server-only";

import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { stripe } from "@/lib/stripe";
import { derivePublicStatus } from "@/lib/events/status";
import { normalizeEmail, normalizePhone } from "@/lib/events/normalize";
import { checkRateLimit } from "@/server/public/rate-limit";
import { triggerSiteRevalidation } from "@/server/site-revalidation";
import { sendOrderConfirmationEmail } from "@/server/events-emails";
import { IncomingCheckoutSchema } from "@/schemas/eventCheckout";
import { HOLD_TTL_MINUTES } from "@/server/public/events";
import {
  isHoneypot,
  chooseCheckoutBranch,
  validateBillingPresence,
  validateMaxSeatsPerOrder,
  computeOrderAmounts,
  shouldResumePendingOrder,
} from "@/server/public/checkout-logic";

// Re-export pure functions for external use
export {
  isHoneypot,
  chooseCheckoutBranch,
  validateBillingPresence,
  validateMaxSeatsPerOrder,
  computeOrderAmounts,
  shouldResumePendingOrder,
} from "@/server/public/checkout-logic";

// ── Tipi helpers ──────────────────────────────────────────────────────
interface EventSnapshot {
  id: string;
  slug: string;
  titleIt: string;
  status: "draft" | "published" | "cancelled";
  startsAt: Timestamp;
  endsAt: Timestamp | null;
  bookingOpensAt: Timestamp | null;
  bookingClosesAt: Timestamp | null;
  capacity: number;
  maxSeatsPerOrder: number | null;
  priceCents: number;
  discountedPriceCents: number | null;
  seatsSold: number;
  seatsHeld: number;
  locationName: string;
}

// ── Helper: genera orderNumber in transazione ─────────────────────────
async function getNextOrderNumber(
  tx: FirebaseFirestore.Transaction,
  year: number,
): Promise<string> {
  const counterRef = adminDb.doc(`counters/eventOrders-${year}`);
  const snap = await tx.get(counterRef);
  const next = (snap.data()?.["seq"] ?? 0) + 1;
  tx.set(counterRef, { seq: next }, { merge: true });
  return `EVT-${year}-${String(next).padStart(4, "0")}`;
}

// ── Tipi risposta checkout ────────────────────────────────────────────
type CheckoutResponse =
  | { mode: "free_confirmed"; order_id: string; order_number: string; total_cents: 0 }
  | {
      mode: "payment";
      order_id: string;
      client_secret: string;
      hold_expires_at: string;
      total_cents: number;
      publishable_hint: "resume" | null;
    };

type CheckoutError =
  | { status: 400; error: string }
  | { status: 409; error: "not_enough_seats"; seats_available: number }
  | { status: 410; error: "not_bookable"; public_status: string }
  | { status: 429; error: string }
  | { status: 500; error: string }
  | { status: 502; error: string };

export type CheckoutResult =
  | { ok: true; data: CheckoutResponse }
  | { ok: false; err: CheckoutError };

// ── Checkout handler ──────────────────────────────────────────────────
export async function handleCheckout(
  rawBody: unknown,
  ip: string,
): Promise<CheckoutResult> {

  // 1. Valida schema wire
  const parsed = IncomingCheckoutSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { ok: false, err: { status: 400, error: "Dati non validi" } };
  }
  const body = parsed.data;

  // 2. Honeypot
  if (isHoneypot(body.website)) {
    // Risposta fake — non rivela la bot detection
    return {
      ok: true,
      data: { mode: "free_confirmed", order_id: "fake", order_number: "EVT-0000", total_cents: 0 },
    };
  }

  const emailNorm = normalizeEmail(body.buyer.email);
  const phoneNorm = normalizePhone(body.buyer.phone);

  // 3. Rate limit IP + email
  const ipAllowed = await checkRateLimit("checkout-ip", ip);
  const emailAllowed = await checkRateLimit("checkout-email", emailNorm);
  if (!ipAllowed || !emailAllowed) {
    return { ok: false, err: { status: 429, error: "Troppe richieste. Riprova tra qualche minuto." } };
  }

  // 4. Leggi evento (pre-read fuori tx)
  const evSnap = await adminDb.collection("events").doc(body.event_id).get();
  if (!evSnap.exists) {
    return { ok: false, err: { status: 410, error: "not_bookable", public_status: "not_found" } };
  }
  const evData = evSnap.data()!;

  const ev: EventSnapshot = {
    id: evSnap.id,
    slug: evData["slug"] ?? "",
    titleIt: evData["title"]?.it ?? "",
    status: evData["status"] ?? "draft",
    startsAt: evData["startsAt"],
    endsAt: evData["endsAt"] ?? null,
    bookingOpensAt: evData["bookingOpensAt"] ?? null,
    bookingClosesAt: evData["bookingClosesAt"] ?? null,
    capacity: evData["capacity"] ?? 0,
    maxSeatsPerOrder: evData["maxSeatsPerOrder"] ?? null,
    priceCents: evData["priceCents"] ?? 0,
    discountedPriceCents: evData["discountedPriceCents"] ?? null,
    seatsSold: evData["seatsSold"] ?? 0,
    seatsHeld: evData["seatsHeld"] ?? 0,
    locationName: evData["location"]?.name ?? "",
  };

  const branch = chooseCheckoutBranch(ev);

  // 5. Valida billing presenza
  const billingErr = validateBillingPresence(branch, !!body.billing);
  if (billingErr === "billing_required_for_paid_event") {
    return { ok: false, err: { status: 400, error: "Profilo di fatturazione obbligatorio per eventi a pagamento." } };
  }
  if (billingErr === "billing_forbidden_for_free_event") {
    return { ok: false, err: { status: 400, error: "Profilo di fatturazione non consentito per eventi gratuiti." } };
  }

  // 6. Valida participants count
  if (body.participants.length !== body.seats) {
    return { ok: false, err: { status: 400, error: "Il numero di partecipanti non corrisponde ai posti richiesti." } };
  }

  const now = new Date();
  const year = now.getFullYear();

  // ── RAMO GRATUITO ─────────────────────────────────────────────────
  if (branch === "free") {
    // Valida cap per-ordine (unica difesa anti-abuso)
    if (!validateMaxSeatsPerOrder(ev.maxSeatsPerOrder, body.seats)) {
      return {
        ok: false,
        err: { status: 400, error: `Puoi prenotare al massimo ${ev.maxSeatsPerOrder} posti per ordine.` },
      };
    }

    let orderId = "";
    let orderNumber = "";

    const txResult = await adminDb.runTransaction(async (tx) => {
      // ri-leggi l'evento nella transazione
      const evRef = adminDb.collection("events").doc(body.event_id);
      const freshSnap = await tx.get(evRef);
      if (!freshSnap.exists) return "event_not_found" as const;

      const freshData = freshSnap.data()!;
      const freshEv = {
        status: freshData["status"] as "draft" | "published" | "cancelled",
        startsAt: freshData["startsAt"],
        endsAt: freshData["endsAt"] ?? null,
        bookingOpensAt: freshData["bookingOpensAt"] ?? null,
        bookingClosesAt: freshData["bookingClosesAt"] ?? null,
        capacity: freshData["capacity"] ?? 0,
        seatsSold: freshData["seatsSold"] ?? 0,
        seatsHeld: freshData["seatsHeld"] ?? 0,
      };

      const ps = derivePublicStatus(
        { ...freshEv, startsAt: freshEv.startsAt.toDate(), endsAt: freshEv.endsAt?.toDate() ?? null, bookingOpensAt: freshEv.bookingOpensAt?.toDate() ?? null, bookingClosesAt: freshEv.bookingClosesAt?.toDate() ?? null },
        now,
      );
      if (ps !== "bookable") return { error: "not_bookable", public_status: ps ?? "draft" };

      const available = freshEv.capacity - freshEv.seatsSold - freshEv.seatsHeld;
      if (available < body.seats) return { error: "not_enough_seats", seats_available: Math.max(0, available) };

      orderNumber = await getNextOrderNumber(tx, year);
      const orderRef = adminDb.collection("eventOrders").doc();
      orderId = orderRef.id;

      const eventSnapshot = {
        slug: ev.slug,
        titleIt: ev.titleIt,
        startsAt: ev.startsAt,
        locationName: ev.locationName,
      };

      tx.set(orderRef, {
        orderNumber,
        eventId: body.event_id,
        eventSnapshot,
        seats: body.seats,
        unitPriceCents: 0,
        totalCents: 0,
        status: "paid",
        buyer: {
          firstName: body.buyer.first_name,
          lastName: body.buyer.last_name,
          email: body.buyer.email,
          emailNormalized: emailNorm,
          phone: body.buyer.phone,
          phoneNormalized: phoneNorm,
        },
        participants: body.participants.map((p) => ({
          firstName: p.first_name,
          lastName: p.last_name,
        })),
        billing: null,
        historyConsent: { granted: body.history_consent, at: body.history_consent ? Timestamp.now() : null },
        locale: body.locale,
        holdExpiresAt: null,
        paymentIntentId: null,
        paidAt: FieldValue.serverTimestamp(),
        refundedAt: null,
        refundId: null,
        ip: ip !== "unknown" ? ip : null,
        version: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        deletedAt: null,
      });

      tx.update(evRef, {
        seatsSold: FieldValue.increment(body.seats),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return "ok" as const;
    });

    if (txResult === "event_not_found") {
      return { ok: false, err: { status: 410, error: "not_bookable", public_status: "not_found" } };
    }
    if (typeof txResult === "object" && txResult.error === "not_bookable") {
      return { ok: false, err: { status: 410, error: "not_bookable", public_status: txResult.public_status ?? "unknown" } };
    }
    if (typeof txResult === "object" && txResult.error === "not_enough_seats") {
      return { ok: false, err: { status: 409, error: "not_enough_seats", seats_available: txResult.seats_available ?? 0 } };
    }

    // After-commit side effects (fire-and-forget)
    Promise.all([
      sendOrderConfirmationEmail({
        orderNumber,
        eventTitleIt: ev.titleIt,
        eventStartsAt: ev.startsAt.toDate().toISOString(),
        locationName: ev.locationName,
        seats: body.seats,
        participants: body.participants.map((p) => ({ firstName: p.first_name, lastName: p.last_name })),
        buyerEmail: body.buyer.email,
        buyerFirstName: body.buyer.first_name,
        totalCents: 0,
        locale: body.locale,
      }),
      triggerSiteRevalidation("events"),
    ]).catch(console.error);

    return {
      ok: true,
      data: { mode: "free_confirmed", order_id: orderId, order_number: orderNumber, total_cents: 0 },
    };
  }

  // ── RAMO A PAGAMENTO ──────────────────────────────────────────────

  // Resume: cerca ordine pending_payment esistente per stessa email+evento
  const resumeQuery = await adminDb
    .collection("eventOrders")
    .where("eventId", "==", body.event_id)
    .where("buyer.emailNormalized", "==", emailNorm)
    .where("status", "==", "pending_payment")
    .limit(1)
    .get();

  if (!resumeQuery.empty) {
    const existingOrder = resumeQuery.docs[0]!;
    const existingData = existingOrder.data();
    if (shouldResumePendingOrder(existingData as { status: string; holdExpiresAt: Timestamp | null }, now)) {
      const pi = await stripe.paymentIntents.retrieve(existingData["paymentIntentId"]);
      return {
        ok: true,
        data: {
          mode: "payment",
          order_id: existingOrder.id,
          client_secret: pi.client_secret!,
          hold_expires_at: (existingData["holdExpiresAt"] as Timestamp).toDate().toISOString(),
          total_cents: existingData["totalCents"] as number,
          publishable_hint: "resume",
        },
      };
    }
  }

  const { unitPriceCents, totalCents } = computeOrderAmounts(ev, body.seats);

  let orderId = "";
  let orderNumber = "";
  const holdExpiresAt = new Date(now.getTime() + HOLD_TTL_MINUTES * 60 * 1000);

  const txResult = await adminDb.runTransaction(async (tx) => {
    const evRef = adminDb.collection("events").doc(body.event_id);
    const freshSnap = await tx.get(evRef);
    if (!freshSnap.exists) return "event_not_found" as const;

    const freshData = freshSnap.data()!;
    const freshEv = {
      status: freshData["status"] as "draft" | "published" | "cancelled",
      startsAt: freshData["startsAt"],
      endsAt: freshData["endsAt"] ?? null,
      bookingOpensAt: freshData["bookingOpensAt"] ?? null,
      bookingClosesAt: freshData["bookingClosesAt"] ?? null,
      capacity: freshData["capacity"] ?? 0,
      seatsSold: freshData["seatsSold"] ?? 0,
      seatsHeld: freshData["seatsHeld"] ?? 0,
      maxSeatsPerOrder: freshData["maxSeatsPerOrder"] ?? null,
    };

    const ps = derivePublicStatus(
      { ...freshEv, startsAt: freshEv.startsAt.toDate(), endsAt: freshEv.endsAt?.toDate() ?? null, bookingOpensAt: freshEv.bookingOpensAt?.toDate() ?? null, bookingClosesAt: freshEv.bookingClosesAt?.toDate() ?? null },
      now,
    );
    if (ps !== "bookable") return { error: "not_bookable", public_status: ps ?? "draft" };

    if (!validateMaxSeatsPerOrder(freshEv.maxSeatsPerOrder, body.seats)) {
      return { error: "max_seats_exceeded" };
    }

    const available = freshEv.capacity - freshEv.seatsSold - freshEv.seatsHeld;
    if (available < body.seats) return { error: "not_enough_seats", seats_available: Math.max(0, available) };

    orderNumber = await getNextOrderNumber(tx, year);
    const orderRef = adminDb.collection("eventOrders").doc();
    orderId = orderRef.id;

    const billing = body.billing ? mapBillingToFirestore(body.billing) : null;

    const eventSnapshot = {
      slug: ev.slug,
      titleIt: ev.titleIt,
      startsAt: ev.startsAt,
      locationName: ev.locationName,
    };

    tx.set(orderRef, {
      orderNumber,
      eventId: body.event_id,
      eventSnapshot,
      seats: body.seats,
      unitPriceCents,
      totalCents,
      status: "pending_payment",
      buyer: {
        firstName: body.buyer.first_name,
        lastName: body.buyer.last_name,
        email: body.buyer.email,
        emailNormalized: emailNorm,
        phone: body.buyer.phone,
        phoneNormalized: phoneNorm,
      },
      participants: body.participants.map((p) => ({
        firstName: p.first_name,
        lastName: p.last_name,
      })),
      billing,
      historyConsent: { granted: body.history_consent, at: body.history_consent ? Timestamp.now() : null },
      locale: body.locale,
      holdExpiresAt: Timestamp.fromDate(holdExpiresAt),
      paymentIntentId: null,
      paidAt: null,
      refundedAt: null,
      refundId: null,
      ip: ip !== "unknown" ? ip : null,
      version: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deletedAt: null,
    });

    tx.update(evRef, {
      seatsHeld: FieldValue.increment(body.seats),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return "ok" as const;
  });

  if (txResult === "event_not_found") {
    return { ok: false, err: { status: 410, error: "not_bookable", public_status: "not_found" } };
  }
  if (typeof txResult === "object" && txResult.error === "not_bookable") {
    return { ok: false, err: { status: 410, error: "not_bookable", public_status: txResult.public_status ?? "unknown" } };
  }
  if (typeof txResult === "object" && txResult.error === "not_enough_seats") {
    return { ok: false, err: { status: 409, error: "not_enough_seats", seats_available: txResult.seats_available ?? 0 } };
  }
  if (typeof txResult === "object" && txResult.error === "max_seats_exceeded") {
    return { ok: false, err: { status: 400, error: `Puoi prenotare al massimo ${ev.maxSeatsPerOrder} posti per ordine.` } };
  }

  // Crea PaymentIntent Stripe
  try {
    const pi = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "eur",
      receipt_email: body.buyer.email,
      description: `${ev.titleIt} × ${body.seats} — ${orderNumber}`,
      metadata: { orderId, eventId: body.event_id, seats: String(body.seats) },
      automatic_payment_methods: { enabled: true },
    });

    await adminDb.collection("eventOrders").doc(orderId).update({
      paymentIntentId: pi.id,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      data: {
        mode: "payment",
        order_id: orderId,
        client_secret: pi.client_secret!,
        hold_expires_at: holdExpiresAt.toISOString(),
        total_cents: totalCents,
        publishable_hint: null,
      },
    };
  } catch (err) {
    // Tx compensativa: rilascia seatsHeld e marca ordine failed
    await adminDb.runTransaction(async (tx) => {
      const evRef = adminDb.collection("events").doc(body.event_id);
      const orderRef = adminDb.collection("eventOrders").doc(orderId);
      tx.update(evRef, { seatsHeld: FieldValue.increment(-body.seats), updatedAt: FieldValue.serverTimestamp() });
      tx.update(orderRef, { status: "failed", updatedAt: FieldValue.serverTimestamp() });
    }).catch(console.error);

    console.error("[Checkout] Stripe PaymentIntent create failed:", err);
    return { ok: false, err: { status: 502, error: "Errore nel sistema di pagamento. Riprova." } };
  }
}

// ── Helper: mappa billing wire → struttura Firestore ────────────────
function mapBillingToFirestore(billing: NonNullable<ReturnType<typeof IncomingCheckoutSchema.parse>["billing"]>) {
  if (billing.type === "private") {
    return {
      type: "private" as const,
      firstName: billing.first_name,
      lastName: billing.last_name,
      taxCode: billing.tax_code,
      address: {
        street: billing.address.street,
        zip: billing.address.zip,
        city: billing.address.city,
        province: billing.address.province,
      },
    };
  }
  return {
    type: "company" as const,
    businessName: billing.business_name,
    vatNumber: billing.vat_number,
    sdiCode: billing.sdi_code ?? null,
    pec: billing.pec ?? null,
    taxCode: billing.tax_code ?? null,
    adminContactName: billing.admin_contact_name ?? null,
    address: {
      street: billing.address.street,
      zip: billing.address.zip,
      city: billing.address.city,
      province: billing.address.province,
    },
  };
}
