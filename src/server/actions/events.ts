"use server";

import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { fromZonedTime } from "date-fns-tz";

import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";
import { EventFormSchema } from "@/schemas/event";
import type { EventDoc, EventStatus } from "@/schemas/event";
import type { ActionResult } from "@/types";
import { NotificationSettingsSchema } from "@/schemas/settings";
import { triggerSiteRevalidation } from "@/server/site-revalidation";
import { tsToISO } from "@/lib/utils/date";
import { seatsAvailable, computeOverbookExcess } from "@/lib/events/status";
import { getStripe } from "@/lib/stripe";
import { buildEmailHtml } from "@/lib/email";
import {
  categorizeOrdersForCancellation,
  computeTotalRefundCents,
  deduplicateBuyerEmails,
  type OrderForCancellation,
} from "@/server/actions/event-refund-logic";
import { sendRefundEmail } from "@/server/actions/eventOrders";
import { sendNewEventNotification } from "@/server/events-notify";
import { shouldNotifySubscribers } from "@/server/public/subscriber-logic";
import { derivePublicStatus } from "@/lib/events/status";

const COL = "events";
const TZ = "Europe/Rome";

// ── Helper: converti datetime-local string → Timestamp (fuso IT) ─────
function dtLocalToTs(val: string | null | undefined): Timestamp | null {
  if (!val) return null;
  try {
    return Timestamp.fromDate(fromZonedTime(val, TZ));
  } catch {
    return null;
  }
}

// ── Converter Firestore doc → EventDoc ───────────────────────────────
function toEventDoc(id: string, data: FirebaseFirestore.DocumentData): EventDoc {
  return {
    id,
    slug: data["slug"] ?? "",
    status: data["status"] ?? "draft",
    title: data["title"] ?? { it: "", en: "" },
    summary: data["summary"] ?? { it: "", en: "" },
    description: data["description"] ?? { it: "", en: "" },
    previewImageUrl: data["previewImageUrl"] ?? "",
    imageUrl: data["imageUrl"] ?? "",
    images: data["images"] ?? [],
    location: data["location"] ?? { name: "", address: "", city: "" },
    startsAt: tsToISO(data["startsAt"]) ?? new Date().toISOString(),
    endsAt: tsToISO(data["endsAt"]) ?? null,
    bookingOpensAt: tsToISO(data["bookingOpensAt"]) ?? null,
    bookingClosesAt: tsToISO(data["bookingClosesAt"]) ?? null,
    capacity: data["capacity"] ?? 1,
    maxSeatsPerOrder: data["maxSeatsPerOrder"] ?? null,
    priceCents: data["priceCents"] ?? 0,
    discountedPriceCents: data["discountedPriceCents"] ?? null,
    featured: data["featured"] ?? false,
    recurrence: data["recurrence"] ?? null,
    recurrenceParentId: data["recurrenceParentId"] ?? null,
    recurrenceProcessedAt: tsToISO(data["recurrenceProcessedAt"]) ?? null,
    seatsSold: data["seatsSold"] ?? 0,
    seatsHeld: data["seatsHeld"] ?? 0,
    subscribersNotifiedAt: tsToISO(data["subscribersNotifiedAt"]) ?? null,
    cancelledAt: tsToISO(data["cancelledAt"]) ?? null,
    createdBy: data["createdBy"] ?? "",
    version: data["version"] ?? 0,
    createdAt: tsToISO(data["createdAt"]),
    updatedAt: tsToISO(data["updatedAt"]),
    deletedAt: tsToISO(data["deletedAt"]) ?? null,
  };
}

// ── Lista eventi ──────────────────────────────────────────────────────
export async function getEvents(
  opts: { includeArchived?: boolean; status?: EventStatus } = {},
): Promise<EventDoc[]> {
  await requireAdmin();

  let query = adminDb.collection(COL).orderBy("startsAt", "asc") as FirebaseFirestore.Query;

  if (!opts.includeArchived) {
    query = adminDb
      .collection(COL)
      .where("deletedAt", "==", null)
      .orderBy("startsAt", "asc") as FirebaseFirestore.Query;
  }

  if (opts.status) {
    query = adminDb
      .collection(COL)
      .where("deletedAt", "==", null)
      .where("status", "==", opts.status)
      .orderBy("startsAt", "asc") as FirebaseFirestore.Query;
  }

  const snap = await query.get();
  return snap.docs.map((d) => toEventDoc(d.id, d.data()));
}

// ── Singolo evento ────────────────────────────────────────────────────
export async function getEvent(id: string): Promise<EventDoc | null> {
  await requireAdmin();

  const snap = await adminDb.collection(COL).doc(id).get();
  if (!snap.exists) return null;
  return toEventDoc(snap.id, snap.data()!);
}

// ── Crea evento ───────────────────────────────────────────────────────
export async function createEvent(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const actor = await requireAdmin();

  const parsed = EventFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path]!.push(issue.message);
    }
    return { success: false, error: "Dati non validi", fieldErrors };
  }

  try {
    // Unicità slug tra eventi non archiviati
    const slugConflict = await adminDb
      .collection(COL)
      .where("slug", "==", parsed.data.slug)
      .where("deletedAt", "==", null)
      .limit(1)
      .get();

    if (!slugConflict.empty) {
      return {
        success: false,
        error: "Slug già in uso",
        fieldErrors: { slug: ["Questo slug è già utilizzato da un altro evento attivo"] },
      };
    }

    const d = parsed.data;
    const doc: Record<string, unknown> = {
      slug: d.slug,
      status: "draft",
      title: d.title,
      summary: d.summary,
      description: d.description,
      previewImageUrl: d.previewImageUrl,
      imageUrl: d.imageUrl,
      images: d.images,
      location: d.location,
      startsAt: dtLocalToTs(d.startsAt),
      endsAt: dtLocalToTs(d.endsAt),
      bookingOpensAt: dtLocalToTs(d.bookingOpensAt),
      bookingClosesAt: dtLocalToTs(d.bookingClosesAt),
      capacity: d.capacity,
      maxSeatsPerOrder: d.maxSeatsPerOrder ?? null,
      priceCents: d.priceCents,
      discountedPriceCents: d.discountedPriceCents ?? null,
      featured: d.featured,
      recurrence: d.recurrence ?? null,
      recurrenceParentId: null,
      recurrenceProcessedAt: null,
      seatsSold: 0,
      seatsHeld: 0,
      subscribersNotifiedAt: null,
      cancelledAt: null,
      version: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deletedAt: null,
      createdBy: actor.uid,
    };

    const docRef = adminDb.collection(COL).doc();
    await docRef.set(doc);

    revalidatePath("/events");
    logger.info("Evento creato", { id: docRef.id, slug: d.slug });
    return { success: true, data: { id: docRef.id } };
  } catch (err) {
    logger.error("Errore creazione evento", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

// ── Aggiorna evento (OCC) ─────────────────────────────────────────────
export async function updateEvent(
  id: string,
  raw: unknown,
  expectedVersion: number,
): Promise<ActionResult<{ warning?: string; excess?: number }>> {
  const actor = await requireAdmin();

  const parsed = EventFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path]!.push(issue.message);
    }
    return { success: false, error: "Dati non validi", fieldErrors };
  }

  try {
    type TxResult =
      | "not_found" | "conflict" | "slug_conflict"
      | { ok: true; overbookedExcess: number | null };

    const txResult = await adminDb.runTransaction(async (tx): Promise<TxResult> => {
      const docRef = adminDb.collection(COL).doc(id);
      const snap = await tx.get(docRef);

      if (!snap.exists) return "not_found";
      const current = snap.data()!;

      if (current["version"] !== expectedVersion) return "conflict";

      // Unicità slug (escludi il doc corrente)
      const slugConflictSnap = await tx.get(
        adminDb
          .collection(COL)
          .where("slug", "==", parsed.data.slug)
          .where("deletedAt", "==", null)
          .limit(1) as FirebaseFirestore.Query,
      );
      if (!slugConflictSnap.empty && slugConflictSnap.docs[0]!.id !== id) {
        return "slug_conflict";
      }

      const d = parsed.data;
      const updateDoc: Record<string, unknown> = {
        slug: d.slug,
        title: d.title,
        summary: d.summary,
        description: d.description,
        previewImageUrl: d.previewImageUrl,
        imageUrl: d.imageUrl,
        images: d.images,
        location: d.location,
        startsAt: dtLocalToTs(d.startsAt),
        endsAt: dtLocalToTs(d.endsAt),
        bookingOpensAt: dtLocalToTs(d.bookingOpensAt),
        bookingClosesAt: dtLocalToTs(d.bookingClosesAt),
        capacity: d.capacity,
        maxSeatsPerOrder: d.maxSeatsPerOrder ?? null,
        priceCents: d.priceCents,
        discountedPriceCents: d.discountedPriceCents ?? null,
        featured: d.featured,
        recurrence: d.recurrence ?? null,
        version: expectedVersion + 1,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      };

      // Verifica overbooking
      const seatsSold: number = current["seatsSold"] ?? 0;
      const seatsHeld: number = current["seatsHeld"] ?? 0;
      const occupied = seatsSold + seatsHeld;
      const excess = computeOverbookExcess(occupied, d.capacity);

      tx.update(docRef, updateDoc);
      return { ok: true, overbookedExcess: excess };
    });

    if (txResult === "not_found") return { success: false, error: "Evento non trovato" };
    if (txResult === "conflict")
      return {
        success: false,
        error: "Il documento è stato modificato da un'altra sessione. Ricarica la pagina.",
      };
    if (txResult === "slug_conflict")
      return {
        success: false,
        error: "Slug già in uso",
        fieldErrors: { slug: ["Questo slug è già utilizzato da un altro evento attivo"] },
      };

    revalidatePath("/events");
    revalidatePath(`/events/${id}`);
    triggerSiteRevalidation("events");

    const { overbookedExcess } = txResult;

    if (overbookedExcess !== null) {
      // Fire-and-forget: notifica admin
      notifyOverbookedEvent(id, parsed.data.slug, overbookedExcess).catch((err) =>
        logger.error("Notifica overbooked fallita", err),
      );
      logger.warn("Evento in overbooking dopo aggiornamento", { id, excess: overbookedExcess });
      return {
        success: true,
        data: { warning: "overbooked", excess: overbookedExcess },
      };
    }

    logger.info("Evento aggiornato", { id, uid: actor.uid });
    return { success: true, data: {} };
  } catch (err) {
    logger.error("Errore aggiornamento evento", err);
    return { success: false, error: "Errore durante il salvataggio. Riprova." };
  }
}

// ── Pubblica evento ───────────────────────────────────────────────────
export async function publishEvent(id: string): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    await adminDb.collection(COL).doc(id).update({
      status: "published",
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });

    revalidatePath("/events");
    revalidatePath(`/events/${id}`);
    triggerSiteRevalidation("events");

    // M7: se l'evento è subito bookable e subscribersNotifiedAt == null → notifica mailing list
    Promise.resolve().then(async () => {
      try {
        const snap = await adminDb.collection(COL).doc(id).get();
        if (!snap.exists) return;
        const data = snap.data()!;
        if (!shouldNotifySubscribers(data["subscribersNotifiedAt"])) return;

        // Deriva lo stato pubblico per capire se è già bookable
        const evForStatus = {
          status: data["status"] as "draft" | "published" | "cancelled",
          startsAt: data["startsAt"]?.toDate?.() ?? new Date(),
          endsAt: data["endsAt"]?.toDate?.() ?? null,
          bookingOpensAt: data["bookingOpensAt"]?.toDate?.() ?? null,
          bookingClosesAt: data["bookingClosesAt"]?.toDate?.() ?? null,
          capacity: data["capacity"] ?? 0,
          seatsSold: data["seatsSold"] ?? 0,
          seatsHeld: data["seatsHeld"] ?? 0,
        };
        const ps = derivePublicStatus(evForStatus, new Date());
        if (ps !== "bookable") return;

        await sendNewEventNotification({
          id,
          slug: data["slug"] ?? "",
          title: data["title"] ?? { it: "", en: "" },
          startsAt: evForStatus.startsAt.toISOString(),
        });
      } catch (err) {
        logger.error("[publishEvent] Errore notifica M7", err);
      }
    });

    logger.info("Evento pubblicato", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore pubblicazione evento", err);
    return { success: false, error: "Errore durante la pubblicazione. Riprova." };
  }
}

// ── Nascondi evento (torna in draft) ──────────────────────────────────
export async function unpublishEvent(id: string): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    await adminDb.collection(COL).doc(id).update({
      status: "draft",
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });

    revalidatePath("/events");
    revalidatePath(`/events/${id}`);
    triggerSiteRevalidation("events");

    logger.info("Evento nascosto (bozza)", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore unpublish evento", err);
    return { success: false, error: "Errore durante l'operazione. Riprova." };
  }
}

// ── Cancella evento ───────────────────────────────────────────────────
export async function cancelEvent(id: string): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    // Blocca la cancellazione se esistono ordini paid (rimborsi automatici = M6)
    const paidOrdersSnap = await adminDb
      .collection("eventOrders")
      .where("eventId", "==", id)
      .where("status", "==", "paid")
      .limit(1)
      .get();

    if (!paidOrdersSnap.empty) {
      return {
        success: false,
        error:
          "Esistono ordini pagati per questo evento. La cancellazione con rimborso automatico sarà disponibile in M6.",
      };
    }

    await adminDb.collection(COL).doc(id).update({
      status: "cancelled",
      cancelledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });

    revalidatePath("/events");
    revalidatePath(`/events/${id}`);
    triggerSiteRevalidation("events");

    logger.info("Evento cancellato", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore cancellazione evento", err);
    return { success: false, error: "Errore durante la cancellazione. Riprova." };
  }
}

// ── Archivia evento (soft delete) ─────────────────────────────────────
export async function archiveEvent(id: string): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    await adminDb.collection(COL).doc(id).update({
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });

    revalidatePath("/events");
    triggerSiteRevalidation("events");

    logger.info("Evento archiviato", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore archiviazione evento", err);
    return { success: false, error: "Errore durante l'archiviazione. Riprova." };
  }
}

// ── Ripristina evento archiviato ──────────────────────────────────────
export async function restoreEvent(id: string): Promise<ActionResult<void>> {
  const actor = await requireAdmin();

  try {
    await adminDb.collection(COL).doc(id).update({
      deletedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });

    revalidatePath("/events");
    logger.info("Evento ripristinato", { id, uid: actor.uid });
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore ripristino evento", err);
    return { success: false, error: "Errore durante il ripristino. Riprova." };
  }
}

// ── Upload immagine evento su Storage ─────────────────────────────────
export async function uploadEventImage(
  eventId: string,
  formData: FormData,
  slot: string,
): Promise<ActionResult<{ url: string }>> {
  await requireAdmin();

  const file = formData.get("image");
  if (!(file instanceof File)) return { success: false, error: "File non trovato" };
  if (file.size > 10 * 1024 * 1024)
    return { success: false, error: "L'immagine non può superare 10MB" };

  const allowedMimes = ["image/png", "image/jpeg", "image/webp"];
  if (!allowedMimes.includes(file.type))
    return { success: false, error: "Formato non supportato. Carica un'immagine PNG, JPEG o WebP." };

  try {
    const ext = file.name.split(".").pop() ?? "jpg";
    const storagePath = `events/${eventId}/${slot}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const bucket = adminStorage.bucket();
    const fileRef = bucket.file(storagePath);

    await fileRef.save(buffer, {
      metadata: { contentType: file.type, cacheControl: "public, max-age=31536000" },
    });

    const [signedUrl] = await fileRef.getSignedUrl({
      action: "read",
      expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    });

    return { success: true, data: { url: signedUrl } };
  } catch (err) {
    logger.error("Errore upload immagine evento", err);
    return { success: false, error: "Errore durante il caricamento. Riprova." };
  }
}

// ── Cancella immagine evento da Storage ───────────────────────────────
export async function deleteEventImage(
  eventId: string,
  slot: string,
): Promise<ActionResult<void>> {
  await requireAdmin();

  try {
    const bucket = adminStorage.bucket();
    const [files] = await bucket.getFiles({ prefix: `events/${eventId}/${slot}.` });
    for (const f of files) await f.delete().catch(() => null);
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("Errore cancellazione immagine evento", err);
    return { success: false, error: "Errore durante la cancellazione." };
  }
}

// ── Helper: notifica admin per overbooking ────────────────────────────
async function notifyOverbookedEvent(
  id: string,
  slug: string,
  excess: number,
): Promise<void> {
  try {
    const snap = await adminDb.doc("settings/notifications").get();
    const config = NotificationSettingsSchema.safeParse(snap.data() ?? {});
    if (!config.success) return;
    const settings = config.data;

    const crmUrl =
      process.env.CRM_BASE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    if (settings.telegramBotToken && settings.telegramChatId) {
      const text = [
        `⚠️ <b>Evento in overbooking</b>`,
        "",
        `📋 Slug: <code>${slug}</code>`,
        `📊 Eccedenza: ${excess} post${excess === 1 ? "o" : "i"}`,
        "",
        `→ <a href="${crmUrl}/events/${id}">Gestisci evento</a>`,
      ].join("\n");

      await fetch(
        `https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: settings.telegramChatId,
            text,
            parse_mode: "HTML",
          }),
        },
      ).catch((err) => console.error("[notifyOverbookedEvent] Telegram error:", err));
    }

    if (settings.notifyNewLeadEmail && settings.notifyEmail) {
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        const { Resend } = await import("resend");
        const resend = new Resend(apiKey);
        await resend.emails
          .send({
            from: process.env.RESEND_FROM_EMAIL ?? "noreply@vinifera.app",
            to: settings.notifyEmail,
            subject: `⚠️ Evento in overbooking: ${slug}`,
            html: `<p>L'evento <b>${slug}</b> è stato salvato con una capienza inferiore ai posti già occupati (eccedenza: ${excess}).</p><p><a href="${crmUrl}/events/${id}">Gestisci evento</a></p>`,
          })
          .catch((err) => console.error("[notifyOverbookedEvent] Email error:", err));
      }
    }
  } catch (err) {
    logger.error("Errore notifica overbooking", err);
  }
}

// ── Cancella evento con rimborsi (M6) ─────────────────────────────────
// Sostituisce/completa cancelEvent per i casi con ordini pagati.
export async function cancelEventWithRefunds(
  id: string,
): Promise<ActionResult<{ paidCount: number; freeCount: number; totalRefundCents: number; errors: string[] }>> {
  const actor = await requireAdmin();

  try {
    // 1. Leggi tutti gli ordini non-terminali dell'evento
    const ordersSnap = await adminDb
      .collection("eventOrders")
      .where("eventId", "==", id)
      .get();

    const orders: OrderForCancellation[] = ordersSnap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          status: data["status"] ?? "",
          paymentIntentId: data["paymentIntentId"] ?? null,
          totalCents: data["totalCents"] ?? 0,
          seats: data["seats"] ?? 0,
          locale: (data["locale"] ?? "it") as "it" | "en",
          buyer: {
            email: data["buyer"]?.email ?? "",
            emailNormalized: data["buyer"]?.emailNormalized ?? "",
            firstName: data["buyer"]?.firstName ?? "",
            lastName: data["buyer"]?.lastName ?? "",
          },
        };
      });

    const plan = categorizeOrdersForCancellation(orders);
    const totalRefundCents = computeTotalRefundCents(plan);
    const errors: string[] = [];

    // 2. Tx: cancella l'evento
    await adminDb.collection(COL).doc(id).update({
      status: "cancelled",
      cancelledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });

    triggerSiteRevalidation("events");

    // 3. Ordini paid a pagamento: Stripe refund (errori non bloccano gli altri)
    for (const order of plan.paidPaid) {
      try {
        await getStripe().refunds.create({ payment_intent: order.paymentIntentId! });
        // Lo stato refunded arriverà via webhook charge.refunded (M4)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Errore Stripe";
        errors.push(`Ordine ${order.id}: ${msg}`);
        logger.error("Refund Stripe fallito durante cancellazione", { orderId: order.id, err });
      }
    }

    // 4. Ordini paid gratuiti: cancel diretto + seatsSold--
    for (const order of plan.paidFree) {
      try {
        await adminDb.runTransaction(async (tx) => {
          tx.update(adminDb.collection("eventOrders").doc(order.id), {
            status: "cancelled",
            updatedAt: FieldValue.serverTimestamp(),
          });
          tx.update(adminDb.collection(COL).doc(id), {
            seatsSold: FieldValue.increment(-order.seats),
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Errore DB";
        errors.push(`Ordine gratuito ${order.id}: ${msg}`);
      }
    }

    // 5. Ordini pending_payment a pagamento: cancel PI + expired
    for (const order of plan.pendingPaid) {
      try {
        await getStripe().paymentIntents.cancel(order.paymentIntentId!);
        await adminDb.collection("eventOrders").doc(order.id).update({
          status: "expired",
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (err) {
        logger.warn("Cancel PI fallito durante cancellazione evento", { orderId: order.id, err });
      }
    }

    // 6. Email agli acquirenti (fire-and-forget)
    Promise.allSettled([
      ...plan.paidPaid.map((order) =>
        ordersSnap.docs.find((d) => d.id === order.id)?.data()
          ? sendRefundEmail(ordersSnap.docs.find((d) => d.id === order.id)!.data())
          : Promise.resolve(),
      ),
      ...plan.paidFree.map((order) => {
        const data = ordersSnap.docs.find((d) => d.id === order.id)?.data();
        if (!data) return Promise.resolve();
        return sendCancelNoRefundEmail(data);
      }),
    ]).catch((err) => logger.error("Email cancellazione fallita", err));

    revalidatePath("/events");
    revalidatePath(`/events/${id}`);
    logger.info("Evento cancellato con rimborsi", { id, paidCount: plan.paidPaid.length, freeCount: plan.paidFree.length });

    return {
      success: true,
      data: {
        paidCount: plan.paidPaid.length,
        freeCount: plan.paidFree.length,
        totalRefundCents,
        errors,
      },
    };
  } catch (err) {
    logger.error("Errore cancellazione evento con rimborsi", { id, err });
    return { success: false, error: "Errore durante la cancellazione. Riprova." };
  }
}

// ── Notifica tutti gli acquirenti ─────────────────────────────────────
export async function notifyAllBuyers(
  eventId: string,
  subject: string,
  body: string,
): Promise<ActionResult<{ sent: number }>> {
  await requireAdmin();

  if (!subject.trim() || !body.trim()) {
    return { success: false, error: "Oggetto e testo sono obbligatori." };
  }

  try {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@vinifera.app";
    if (!apiKey) return { success: false, error: "Email non configurata (RESEND_API_KEY mancante)." };

    // Leggi ordini paid per questo evento (i gratuiti sono paid con totalCents 0)
    const ordersSnap = await adminDb
      .collection("eventOrders")
      .where("eventId", "==", eventId)
      .where("status", "==", "paid")
      .get();

    const orders: OrderForCancellation[] = ordersSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        status: "paid",
        paymentIntentId: data["paymentIntentId"] ?? null,
        totalCents: data["totalCents"] ?? 0,
        seats: data["seats"] ?? 0,
        locale: (data["locale"] ?? "it") as "it" | "en",
        buyer: {
          email: data["buyer"]?.email ?? "",
          emailNormalized: data["buyer"]?.emailNormalized ?? "",
          firstName: data["buyer"]?.firstName ?? "",
          lastName: data["buyer"]?.lastName ?? "",
        },
      };
    });

    const recipients = deduplicateBuyerEmails(orders);
    if (recipients.length === 0) {
      return { success: false, error: "Nessun acquirente da notificare." };
    }

    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    let sent = 0;

    for (const recipient of recipients) {
      const html = buildEmailHtml({
        title: subject,
        body: `<p>${body.replace(/\n/g, "<br/>")}</p>`,
      });
      await resend.emails
        .send({ from: fromEmail, to: recipient.email, subject, html })
        .then(() => { sent++; })
        .catch((err) => logger.error("notifyAllBuyers email fallita", { email: recipient.email, err }));
    }

    // Log in subcollection notifications dell'evento
    await adminDb.collection(COL).doc(eventId).collection("notifications").add({
      subject,
      body,
      sentAt: FieldValue.serverTimestamp(),
      recipientCount: sent,
    });

    logger.info("notifyAllBuyers completato", { eventId, sent });
    return { success: true, data: { sent } };
  } catch (err) {
    logger.error("Errore notifyAllBuyers", { eventId, err });
    return { success: false, error: "Errore durante l'invio. Riprova." };
  }
}

// ── Helper email cancellazione senza rimborso (gratuiti) ─────────────
async function sendCancelNoRefundEmail(
  data: FirebaseFirestore.DocumentData,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@vinifera.app";
  if (!apiKey) return;

  const locale: "it" | "en" = data["locale"] ?? "it";
  const isIt = locale === "it";
  const buyer = data["buyer"] as { firstName: string; email: string };
  const titleIt = data["eventSnapshot"]?.titleIt ?? "";

  const subject = isIt
    ? `Evento cancellato — ${titleIt}`
    : `Event cancelled — ${titleIt}`;

  const html = buildEmailHtml({
    title: subject,
    body: isIt
      ? `<p>Ciao ${buyer.firstName},</p><p>L'evento <strong>${titleIt}</strong> è stato cancellato. La tua prenotazione gratuita è stata annullata.</p>`
      : `<p>Hi ${buyer.firstName},</p><p>The event <strong>${titleIt}</strong> has been cancelled. Your free booking has been cancelled.</p>`,
  });

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  await resend.emails.send({ from: fromEmail, to: buyer.email, subject, html }).catch(console.error);
}

