import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { tsToISO } from "@/lib/utils/date";
import type { ServiceDoc } from "@/schemas/service";

export function toServiceDoc(id: string, data: FirebaseFirestore.DocumentData): ServiceDoc {
  return {
    id,
    slug: data["slug"] ?? "",
    order: data["order"] ?? 0,
    inEvidenza: data["inEvidenza"] ?? false,
    available: data["available"] ?? true,
    title: data["title"] ?? { it: "", en: "" },
    summary: data["summary"] ?? { it: "", en: "" },
    description: data["description"] ?? { it: "", en: "" },
    benefits: data["benefits"] ?? { it: [], en: [] },
    faq: data["faq"] ?? { it: [], en: [] },
    imageUrl: data["imageUrl"] ?? "",
    images: data["images"] ?? [],
    basePrice: data["basePrice"] ?? null,
    discountedPrice: data["discountedPrice"] ?? null,
    priceLabel: data["priceLabel"] ?? null,
    version: data["version"] ?? 0,
    createdAt: tsToISO(data["createdAt"]),
    updatedAt: tsToISO(data["updatedAt"]),
    deletedAt: tsToISO(data["deletedAt"]) ?? null,
  };
}

// Ritorna TUTTI i servizi non archiviati (available true E false).
// NON filtra su `available`: il sito mostra i servizi non disponibili
// con il badge "Lista d'attesa" — filtrarli qui li farebbe sparire e
// le loro pagine /servizi/[slug] darebbero 404.
export async function getPublicServices(): Promise<ServiceDoc[]> {
  const snap = await adminDb
    .collection("services")
    .where("deletedAt", "==", null)
    .orderBy("order")
    .get();
  return snap.docs.map((d) => toServiceDoc(d.id, d.data()));
}
