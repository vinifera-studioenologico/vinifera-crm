import "server-only";

const HOST = process.env.POSTHOG_API_HOST ?? "https://eu.posthog.com";
const PROJECT = process.env.POSTHOG_PROJECT_ID ?? "";
const KEY = process.env.POSTHOG_PERSONAL_API_KEY ?? "";

function assertConfigured() {
  if (!PROJECT || !KEY)
    throw new Error(
      "PostHog non configurato (POSTHOG_PROJECT_ID / POSTHOG_PERSONAL_API_KEY mancanti)",
    );
}

/**
 * Cache in-memory con TTL.
 * OBBLIGATORIA: il Query API usa POST e next: { revalidate } NON funziona sui POST.
 * L'istanza server è long-lived → la Map sopravvive tra le richieste.
 */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minuti
const _cache = new Map<string, { at: number; value: unknown }>();

/** Esegue una query HogQL e ritorna le righe + colonne. */
export async function hogql<T = unknown[]>(
  query: string,
  name: string,
): Promise<{ results: T[]; columns: string[] }> {
  assertConfigured();
  const hit = _cache.get(query);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.value as { results: T[]; columns: string[] };
  }
  const res = await fetch(`${HOST}/api/projects/${PROJECT}/query/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query }, name }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`PostHog query failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  const value = { results: json.results ?? [], columns: json.columns ?? [] };
  _cache.set(query, { at: Date.now(), value });
  return value;
}

export interface RecordingSummary {
  id: string;
  distinct_id: string | null;
  recording_duration: number;
  start_time: string;
  start_url: string | null;
  click_count: number;
  person: { name: string | null; distinct_ids: string[] } | null;
}

/** Lista delle registrazioni di sessione più recenti. */
export async function listRecordings(limit = 20): Promise<RecordingSummary[]> {
  assertConfigured();
  const res = await fetch(
    `${HOST}/api/projects/${PROJECT}/session_recordings/?limit=${limit}`,
    {
      headers: { Authorization: `Bearer ${KEY}` },
      next: { revalidate: 120 },
    },
  );
  if (!res.ok) throw new Error(`PostHog recordings failed (${res.status})`);
  const json = await res.json();
  return json.results ?? [];
}

/** URL diretto al player del replay su PostHog. */
export function replayUrl(recordingId: string): string {
  return `${HOST}/project/${PROJECT}/replay/${recordingId}`;
}

/** URL alla scheda persona su PostHog. */
export function personUrl(distinctId: string): string {
  return `${HOST}/project/${PROJECT}/person/${encodeURIComponent(distinctId)}`;
}
