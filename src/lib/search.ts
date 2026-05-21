import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { tsToISO } from "@/lib/utils/date";

// ── Result shapes ─────────────────────────────────────────────────────

export interface ClientHit {
  id: string;
  displayName: string;
  email: string;
  type: "business" | "individual";
}

export interface SampleHit {
  id: string;
  code: string;
  sampleName: string;
  clientName: string;
  status: string;
}

export interface QuoteHit {
  id: string;
  number: string;
  clientName: string;
  status: string;
  totalCents: number;
}

export interface ReportHit {
  id: string;
  number: string;
  clientName: string;
  generatedAt: string | null;
}

export interface PackageHit {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
}

export interface AnalysisHit {
  id: string;
  code: string;
  name: string;
  category: string | null;
}

export interface ReminderHit {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueAt: string | null;
}

export interface PaymentHit {
  id: string;
  description: string;
  status: string;
  totalAmountCents: number;
}

export interface GlobalSearchResults {
  clients: ClientHit[];
  samples: SampleHit[];
  quotes: QuoteHit[];
  reports: ReportHit[];
  packages: PackageHit[];
  analyses: AnalysisHit[];
  reminders: ReminderHit[];
  payments: PaymentHit[];
  total: number;
  query: string;
}

// ── Constants ─────────────────────────────────────────────────────────

/** Documenti massimi da caricare per collection (ottimizzazione payload). */
const FETCH_LIMIT = 500;

/** Risultati massimi mostrati per categoria. */
export const MAX_HITS_PER_CATEGORY = 5;

const EMPTY_RESULTS = (query: string): GlobalSearchResults => ({
  clients: [],
  samples: [],
  quotes: [],
  reports: [],
  packages: [],
  analyses: [],
  reminders: [],
  payments: [],
  total: 0,
  query,
});

// ── Core function ─────────────────────────────────────────────────────

/**
 * Ricerca globale cross-collection.
 *
 * Strategia: fetch parallelo di tutte le collection con `.select()` per
 * minimizzare il payload Firestore, poi filtraggio in-memory case-insensitive.
 */
export async function globalSearch(query: string): Promise<GlobalSearchResults> {
  await requireAdmin();

  const q = query.trim().toLowerCase();

  if (q.length < 2) {
    return EMPTY_RESULTS(query);
  }

  // ── Fetch parallelo — tutti e 8 le collection in una sola chiamata ─
  const [
    clientsSnap,
    samplesSnap,
    quotesSnap,
    reportsSnap,
    packagesSnap,
    analysesSnap,
    remindersSnap,
    paymentsSnap,
  ] = await Promise.all([
    adminDb
      .collection("clients")
      .select("displayName", "email", "type", "deletedAt")
      .limit(FETCH_LIMIT)
      .get(),
    adminDb
      .collection("samples")
      .orderBy("createdAt", "desc")
      .select("code", "sampleName", "clientNameSnapshot", "status")
      .limit(FETCH_LIMIT)
      .get(),
    adminDb
      .collection("quotes")
      .orderBy("createdAt", "desc")
      .select("number", "clientSnapshot", "status", "totalCents")
      .limit(FETCH_LIMIT)
      .get(),
    adminDb
      .collection("reports")
      .orderBy("createdAt", "desc")
      .select("number", "clientSnapshot", "generatedAt")
      .limit(FETCH_LIMIT)
      .get(),
    adminDb
      .collection("packages")
      .select("name", "description", "priceCents", "deletedAt")
      .limit(FETCH_LIMIT)
      .get(),
    adminDb
      .collection("analyses")
      .select("code", "name", "category", "deletedAt")
      .limit(FETCH_LIMIT)
      .get(),
    adminDb
      .collection("reminders")
      .orderBy("dueAt", "desc")
      .select("title", "description", "status", "dueAt")
      .limit(FETCH_LIMIT)
      .get(),
    adminDb
      .collection("payments")
      .orderBy("createdAt", "desc")
      .select("description", "status", "totalAmountCents", "deletedAt")
      .limit(FETCH_LIMIT)
      .get(),
  ]);

  // ── Clienti (escludi archiviati) ──────────────────────────────────
  const clients: ClientHit[] = clientsSnap.docs
    .filter((doc) => {
      const d = doc.data();
      if (d["deletedAt"] !== null && d["deletedAt"] !== undefined) return false;
      return (
        (d["displayName"] as string ?? "").toLowerCase().includes(q) ||
        (d["email"] as string ?? "").toLowerCase().includes(q)
      );
    })
    .slice(0, MAX_HITS_PER_CATEGORY)
    .map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        displayName: d["displayName"] as string ?? "",
        email: d["email"] as string ?? "",
        type: (d["type"] as "business" | "individual") ?? "individual",
      };
    });

  // ── Campioni ──────────────────────────────────────────────────────
  const samples: SampleHit[] = samplesSnap.docs
    .filter((doc) => {
      const d = doc.data();
      return (
        (d["code"] as string ?? "").toLowerCase().includes(q) ||
        (d["sampleName"] as string ?? "").toLowerCase().includes(q) ||
        (d["clientNameSnapshot"] as string ?? "").toLowerCase().includes(q)
      );
    })
    .slice(0, MAX_HITS_PER_CATEGORY)
    .map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        code: d["code"] as string ?? "",
        sampleName: d["sampleName"] as string ?? "",
        clientName: d["clientNameSnapshot"] as string ?? "",
        status: d["status"] as string ?? "pending",
      };
    });

  // ── Preventivi ────────────────────────────────────────────────────
  const quotes: QuoteHit[] = quotesSnap.docs
    .filter((doc) => {
      const d = doc.data();
      const clientName = (d["clientSnapshot"]?.["displayName"] as string ?? "").toLowerCase();
      return (
        (d["number"] as string ?? "").toLowerCase().includes(q) ||
        clientName.includes(q)
      );
    })
    .slice(0, MAX_HITS_PER_CATEGORY)
    .map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        number: d["number"] as string ?? "",
        clientName: d["clientSnapshot"]?.["displayName"] as string ?? "",
        status: d["status"] as string ?? "draft",
        totalCents: d["totalCents"] as number ?? 0,
      };
    });

  // ── Referti ───────────────────────────────────────────────────────
  const reports: ReportHit[] = reportsSnap.docs
    .filter((doc) => {
      const d = doc.data();
      const clientName = (d["clientSnapshot"]?.["displayName"] as string ?? "").toLowerCase();
      return (
        (d["number"] as string ?? "").toLowerCase().includes(q) ||
        clientName.includes(q)
      );
    })
    .slice(0, MAX_HITS_PER_CATEGORY)
    .map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        number: d["number"] as string ?? "",
        clientName: d["clientSnapshot"]?.["displayName"] as string ?? "",
        generatedAt: tsToISO(d["generatedAt"]) ?? null,
      };
    });

  // ── Pacchetti (escludi archiviati) ────────────────────────────────
  const packages: PackageHit[] = packagesSnap.docs
    .filter((doc) => {
      const d = doc.data();
      if (d["deletedAt"] !== null && d["deletedAt"] !== undefined) return false;
      return (
        (d["name"] as string ?? "").toLowerCase().includes(q) ||
        (d["description"] as string ?? "").toLowerCase().includes(q)
      );
    })
    .slice(0, MAX_HITS_PER_CATEGORY)
    .map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        name: d["name"] as string ?? "",
        description: (d["description"] as string | undefined) ?? null,
        priceCents: d["priceCents"] as number ?? 0,
      };
    });

  // ── Analisi (escludi archiviate) ──────────────────────────────────
  const analyses: AnalysisHit[] = analysesSnap.docs
    .filter((doc) => {
      const d = doc.data();
      if (d["deletedAt"] !== null && d["deletedAt"] !== undefined) return false;
      return (
        (d["code"] as string ?? "").toLowerCase().includes(q) ||
        (d["name"] as string ?? "").toLowerCase().includes(q) ||
        (d["category"] as string ?? "").toLowerCase().includes(q)
      );
    })
    .slice(0, MAX_HITS_PER_CATEGORY)
    .map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        code: d["code"] as string ?? "",
        name: d["name"] as string ?? "",
        category: (d["category"] as string | undefined) ?? null,
      };
    });

  // ── Promemoria ────────────────────────────────────────────────────
  const reminders: ReminderHit[] = remindersSnap.docs
    .filter((doc) => {
      const d = doc.data();
      return (
        (d["title"] as string ?? "").toLowerCase().includes(q) ||
        (d["description"] as string ?? "").toLowerCase().includes(q)
      );
    })
    .slice(0, MAX_HITS_PER_CATEGORY)
    .map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        title: d["title"] as string ?? "",
        description: (d["description"] as string | undefined) ?? null,
        status: d["status"] as string ?? "pending",
        dueAt: tsToISO(d["dueAt"]) ?? null,
      };
    });

  // ── Pagamenti (escludi cancellati) ────────────────────────────────
  const payments: PaymentHit[] = paymentsSnap.docs
    .filter((doc) => {
      const d = doc.data();
      if (d["deletedAt"] !== null && d["deletedAt"] !== undefined) return false;
      return (d["description"] as string ?? "").toLowerCase().includes(q);
    })
    .slice(0, MAX_HITS_PER_CATEGORY)
    .map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        description: d["description"] as string ?? "",
        status: d["status"] as string ?? "pending",
        totalAmountCents: d["totalAmountCents"] as number ?? 0,
      };
    });

  const total =
    clients.length +
    samples.length +
    quotes.length +
    reports.length +
    packages.length +
    analyses.length +
    reminders.length +
    payments.length;

  return {
    clients,
    samples,
    quotes,
    reports,
    packages,
    analyses,
    reminders,
    payments,
    total,
    query,
  };
}


// ── Result shapes ─────────────────────────────────────────────────────

export interface ClientHit {
  id: string;
  displayName: string;
  email: string;
  type: "business" | "individual";
}

export interface SampleHit {
  id: string;
  code: string;
  sampleName: string;
  clientName: string;
  status: string;
}

export interface QuoteHit {
  id: string;
  number: string;
  clientName: string;
  status: string;
  totalCents: number;
}


