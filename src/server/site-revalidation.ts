import "server-only";
import { logger } from "@/lib/logger";

export type RevalidationTag = "services" | "events";

/**
 * Notifica il sito di invalidare la cache ISR per il tag indicato.
 * Fire-and-forget: gli errori sono loggati ma non bloccano la risposta.
 */
export async function triggerSiteRevalidation(tag: RevalidationTag): Promise<void> {
  const siteUrl = process.env.SITE_URL;
  const apiKey = process.env.CRM_API_KEY;
  if (!siteUrl || !apiKey) return;

  fetch(`${siteUrl}/api/revalidate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ tag }),
  }).catch((err) => logger.error("Revalidation sito fallita", { tag, err }));
}
