import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { tsToISO } from "@/lib/utils/date";
import { derivePublicStatus, seatsAvailable, isFreeEvent } from "@/lib/events/status";
import type { PublicEventStatus } from "@/lib/events/status";

// TTL hold in minuti — costante, modificare qui per cambiarlo
export const HOLD_TTL_MINUTES = 15;

// ── DTO pubblico evento ───────────────────────────────────────────────
export interface PublicEventDto {
  id: string;
  slug: string;
  title: { it: string; en: string };
  summary: { it: string; en: string };
  description: { it: string; en: string };
  previewImageUrl: string;
  imageUrl: string;
  images: string[];
  location: { name: string; address: string; city: string };
  startsAt: string;
  endsAt: string | null;
  bookingOpensAt: string | null;
  bookingClosesAt: string | null;
  priceCents: number;
  discountedPriceCents: number | null;
  featured: boolean;
  maxSeatsPerOrder: number | null;
  publicStatus: PublicEventStatus;
  seatsAvailable: number; // clamped >= 0
}

// ── DTO disponibilità (no-cache, per checkout) ────────────────────────
export interface EventAvailabilityDto {
  publicStatus: PublicEventStatus | null;
  seatsAvailable: number;
  maxSeatsPerOrder: number | null;
  priceCents: number;
  discountedPriceCents: number | null;
  isFree: boolean;
  holdTtlMinutes: number;
}

// ── Helper: converti Timestamp any → Date per derivePublicStatus ──────
function anyToDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "string") return new Date(val);
  if (typeof val === "object" && "toDate" in (val as object)) {
    return (val as { toDate(): Date }).toDate();
  }
  return null;
}

// ── Converter doc Firestore → PublicEventDto ──────────────────────────
function toPublicEventDto(
  id: string,
  data: FirebaseFirestore.DocumentData,
): PublicEventDto | null {
  const now = new Date();

  const startsAt = anyToDate(data["startsAt"]);
  if (!startsAt) return null; // data obbligatoria

  const endsAt = anyToDate(data["endsAt"]);
  const bookingOpensAt = anyToDate(data["bookingOpensAt"]);
  const bookingClosesAt = anyToDate(data["bookingClosesAt"]);

  const capacity: number = data["capacity"] ?? 1;
  const seatsSold: number = data["seatsSold"] ?? 0;
  const seatsHeld: number = data["seatsHeld"] ?? 0;
  const priceCents: number = data["priceCents"] ?? 0;
  const status: string = data["status"] ?? "draft";

  const evForStatus = {
    status: status as "draft" | "published" | "cancelled",
    startsAt,
    endsAt,
    bookingOpensAt,
    bookingClosesAt,
    capacity,
    seatsSold,
    seatsHeld,
  };

  const publicStatus = derivePublicStatus(evForStatus, now);
  if (!publicStatus) return null; // draft → non pubblico

  const available = Math.max(
    0,
    seatsAvailable({ capacity, seatsSold, seatsHeld }),
  );

  return {
    id,
    slug: data["slug"] ?? "",
    title: data["title"] ?? { it: "", en: "" },
    summary: data["summary"] ?? { it: "", en: "" },
    description: data["description"] ?? { it: "", en: "" },
    previewImageUrl: data["previewImageUrl"] ?? "",
    imageUrl: data["imageUrl"] ?? "",
    images: data["images"] ?? [],
    location: data["location"] ?? { name: "", address: "", city: "" },
    startsAt: startsAt.toISOString(),
    endsAt: endsAt?.toISOString() ?? null,
    bookingOpensAt: bookingOpensAt?.toISOString() ?? null,
    bookingClosesAt: bookingClosesAt?.toISOString() ?? null,
    priceCents,
    discountedPriceCents: data["discountedPriceCents"] ?? null,
    featured: data["featured"] ?? false,
    maxSeatsPerOrder: data["maxSeatsPerOrder"] ?? null,
    publicStatus,
    seatsAvailable: available,
  };
}

// ── Lista eventi pubblici ─────────────────────────────────────────────
// Ritorna: status published, non cancelled, non archiviati.
// Esclude i draft (derivato da publicStatus). Include i passati (badge "Concluso").
export async function getPublicEvents(): Promise<PublicEventDto[]> {
  const snap = await adminDb
    .collection("events")
    .where("deletedAt", "==", null)
    .where("status", "==", "published")
    .orderBy("startsAt", "asc")
    .get();

  const dtos: PublicEventDto[] = [];
  for (const doc of snap.docs) {
    const dto = toPublicEventDto(doc.id, doc.data());
    if (dto) dtos.push(dto);
  }
  return dtos;
}

// ── Disponibilità singolo evento (no-cache) ───────────────────────────
export async function getEventAvailability(
  id: string,
): Promise<EventAvailabilityDto | null> {
  const snap = await adminDb.collection("events").doc(id).get();
  if (!snap.exists) return null;

  const data = snap.data()!;
  const now = new Date();

  const startsAt = anyToDate(data["startsAt"]);
  if (!startsAt) return null;

  const capacity: number = data["capacity"] ?? 1;
  const seatsSold: number = data["seatsSold"] ?? 0;
  const seatsHeld: number = data["seatsHeld"] ?? 0;
  const priceCents: number = data["priceCents"] ?? 0;
  const status: string = data["status"] ?? "draft";

  const evForStatus = {
    status: status as "draft" | "published" | "cancelled",
    startsAt,
    endsAt: anyToDate(data["endsAt"]),
    bookingOpensAt: anyToDate(data["bookingOpensAt"]),
    bookingClosesAt: anyToDate(data["bookingClosesAt"]),
    capacity,
    seatsSold,
    seatsHeld,
  };

  const publicStatus = derivePublicStatus(evForStatus, now);
  const available = Math.max(0, seatsAvailable({ capacity, seatsSold, seatsHeld }));

  return {
    publicStatus,
    seatsAvailable: available,
    maxSeatsPerOrder: data["maxSeatsPerOrder"] ?? null,
    priceCents,
    discountedPriceCents: data["discountedPriceCents"] ?? null,
    isFree: isFreeEvent({ priceCents }),
    holdTtlMinutes: HOLD_TTL_MINUTES,
  };
}

// Riexport helper per uso in converter M1 (toEventDoc in public)
export { tsToISO };
