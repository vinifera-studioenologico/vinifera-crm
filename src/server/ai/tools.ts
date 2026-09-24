import "server-only";

import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { differenceInCalendarDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";

import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/server/auth";
import { globalSearch } from "@/lib/search";
import { getClient, getClients } from "@/server/actions/clients";
import { getSamples, getSample, getClientActivePkgs, getLinkedPaymentSummary } from "@/server/actions/samples";
import { getQuotes } from "@/server/actions/quotes";
import { getReminders } from "@/server/actions/reminders";
import { getAnalyses } from "@/server/actions/analyses";
import { getExpenses } from "@/server/actions/costs";
import { getDashboardStats, getMonthlyStats } from "@/server/actions/stats";
import { formatEUR } from "@/lib/utils/money";
import { formatDate, TZ } from "@/lib/utils/date";
import { CATEGORY_LABELS } from "@/lib/constants/expenses";
import {
  SampleStatusSchema,
  PaymentStatusSchema,
  QuoteStatusSchema,
  ReminderStatusSchema,
  ExpenseCategorySchema,
} from "@/schemas";

// ── Helpers condivisi ───────────────────────────────────────────────────

/** Ogni importo va restituito sia in centesimi che formattato — il modello
 * non deve fare aritmetica sui centesimi. */
function money(cents: number): { cents: number; eur: string } {
  return { cents, eur: formatEUR(cents) };
}

/** Giorni trascorsi da una data ISO, calcolati in Europe/Rome — evita che
 * il modello debba fare aritmetica sulle date da solo (fonte di errori). */
function ageDaysFromISO(iso: string | undefined): number | null {
  if (!iso) return null;
  const created = toZonedTime(new Date(iso), TZ);
  const now = toZonedTime(new Date(), TZ);
  return differenceInCalendarDays(now, created);
}

/** I risultati degli strumenti rientrano nel contesto del modello a ogni
 * giro: si restituiscono sempre come stringa JSON compatta. */
function toolResult(data: unknown): string {
  return JSON.stringify(data);
}

const LimitSchema = z
  .number()
  .int()
  .min(1)
  .max(50)
  .optional()
  .describe("Numero massimo di risultati (default 20, massimo 50)");

async function resolveClientNames(clientIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(clientIds)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const refs = unique.map((id) => adminDb.collection("clients").doc(id));
  const snaps = await adminDb.getAll(...refs);
  const map = new Map<string, string>();
  for (const snap of snaps) {
    if (snap.exists) map.set(snap.id, (snap.data()?.["displayName"] as string) ?? "");
  }
  return map;
}

// ── search_global ────────────────────────────────────────────────────────

export const searchGlobalTool = betaZodTool({
  name: "search_global",
  description:
    "Ricerca trasversale su tutte le entità del CRM per nome, codice o numero. È lo strumento " +
    'di partenza quando la domanda nomina qualcuno o qualcosa (es. "cosa ha ordinato Rossi?", ' +
    '"trova il campione C-2026-0012"). Restituisce al massimo 5 risultati per categoria.',
  inputSchema: z.object({
    query: z.string().min(1).describe("Termine di ricerca: nome cliente, codice campione, numero preventivo, ecc."),
  }),
  run: async ({ query }) => {
    const results = await globalSearch(query);
    const hits = [
      ...results.clients.map((c) => ({
        type: "cliente",
        id: c.id,
        label: `${c.displayName} (${c.type === "business" ? "azienda" : "privato"})`,
        href: `/clients/${c.id}`,
      })),
      ...results.samples.map((s) => ({
        type: "campione",
        id: s.id,
        label: `${s.code} — ${s.sampleName} (${s.clientName})`,
        status: s.status,
        href: `/samples/${s.id}`,
      })),
      ...results.quotes.map((q) => ({
        type: "preventivo",
        id: q.id,
        label: `Preventivo ${q.number} — ${q.clientName}`,
        status: q.status,
        totalEUR: formatEUR(q.totalCents),
        href: `/quotes/${q.id}`,
      })),
      ...results.reports.map((r) => ({
        type: "referto",
        id: r.id,
        label: `Referto ${r.number} — ${r.clientName}`,
        href: "/reports",
      })),
      ...results.packages.map((p) => ({
        type: "pacchetto",
        id: p.id,
        label: p.name,
        href: "/packages",
      })),
      ...results.analyses.map((a) => ({
        type: "analisi",
        id: a.id,
        label: `${a.code} — ${a.name}`,
        href: "/analyses",
      })),
      ...results.reminders.map((r) => ({
        type: "promemoria",
        id: r.id,
        label: r.title,
        status: r.status,
        href: "/reminders",
      })),
      ...results.payments.map((p) => ({
        type: "pagamento",
        id: p.id,
        label: p.description,
        status: p.status,
        totalEUR: formatEUR(p.totalAmountCents),
        href: "/payments",
      })),
    ];
    return toolResult({ query, totalMatches: results.total, results: hits });
  },
});

// ── get_client ────────────────────────────────────────────────────────────

export const getClientTool = betaZodTool({
  name: "get_client",
  description:
    "Scheda completa di un cliente: anagrafica, statistiche (fatturato, pendente, scaduto) e " +
    'pacchetti/crediti attivi. Serve l\'id del cliente — se non lo hai, usa prima search_global ' +
    "o list_clients.",
  inputSchema: z.object({
    clientId: z.string().min(1),
  }),
  run: async ({ clientId }) => {
    const client = await getClient(clientId);
    if (!client) return toolResult({ found: false });

    const activePackages = await getClientActivePkgs(clientId);

    return toolResult({
      found: true,
      id: client.id,
      displayName: client.displayName,
      type: client.type,
      email: client.email,
      phone: client.phone,
      stats: {
        totalRevenue: money(client.stats.totalRevenueCents),
        pending: money(client.stats.pendingAmountCents),
        overdue: money(client.stats.overdueAmountCents),
        samplesPending: client.stats.samplesPending,
        remainingAnalyses: client.stats.remainingAnalyses,
      },
      activePackages: activePackages.map((p) => ({
        id: p.id,
        name: p.packageNameSnapshot,
        remainingAnalyses: p.remainingAnalyses,
      })),
      href: `/clients/${client.id}`,
    });
  },
});

// ── list_clients ──────────────────────────────────────────────────────────

export const listClientsTool = betaZodTool({
  name: "list_clients",
  description:
    "Elenco clienti, filtrabile per tipo (azienda/privato) e ordinabile per fatturato o " +
    'insoluto. Utile per domande come "quali clienti hanno più insoluto?".',
  inputSchema: z.object({
    type: z.enum(["business", "individual"]).optional().describe("Filtra per azienda o privato"),
    sortBy: z.enum(["revenue", "pending", "overdue", "name"]).optional().describe("Criterio di ordinamento (default: nome)"),
    includeArchived: z.boolean().optional().describe("Includi clienti archiviati (default: no)"),
    limit: LimitSchema,
  }),
  run: async ({ type, sortBy, includeArchived, limit }) => {
    const { items } = await getClients({ includeArchived: includeArchived ?? false });
    let filtered = type ? items.filter((c) => c.type === type) : items;

    if (sortBy === "revenue") {
      filtered = [...filtered].sort((a, b) => b.stats.totalRevenueCents - a.stats.totalRevenueCents);
    } else if (sortBy === "pending") {
      filtered = [...filtered].sort((a, b) => b.stats.pendingAmountCents - a.stats.pendingAmountCents);
    } else if (sortBy === "overdue") {
      filtered = [...filtered].sort((a, b) => b.stats.overdueAmountCents - a.stats.overdueAmountCents);
    }

    return toolResult({
      total: filtered.length,
      items: filtered.slice(0, limit ?? 20).map((c) => ({
        id: c.id,
        displayName: c.displayName,
        type: c.type,
        email: c.email,
        revenue: money(c.stats.totalRevenueCents),
        pending: money(c.stats.pendingAmountCents),
        overdue: money(c.stats.overdueAmountCents),
        samplesPending: c.stats.samplesPending,
        href: `/clients/${c.id}`,
      })),
    });
  },
});

// ── list_samples ──────────────────────────────────────────────────────────

export const listSamplesTool = betaZodTool({
  name: "list_samples",
  description:
    "Elenco campioni, filtrabile per cliente e stato. Ogni campione include ageDays (giorni " +
    'trascorsi dalla creazione) — usalo per domande come "campioni in lavorazione da più di una ' +
    'settimana" invece di calcolare le date da solo.',
  inputSchema: z.object({
    clientId: z.string().optional(),
    status: SampleStatusSchema.optional(),
    limit: LimitSchema,
  }),
  run: async ({ clientId, status, limit }) => {
    const { items } = await getSamples({ clientId, status });
    return toolResult({
      total: items.length,
      items: items.slice(0, limit ?? 20).map((s) => ({
        id: s.id,
        code: s.code,
        sampleName: s.sampleName,
        clientName: s.clientNameSnapshot,
        status: s.status,
        ageDays: ageDaysFromISO(s.createdAt),
        itemsCount: s.items.length,
        estimatedTotal: money(s.estimatedTotalCents),
        href: `/samples/${s.id}`,
      })),
    });
  },
});

// ── get_sample ────────────────────────────────────────────────────────────

export const getSampleTool = betaZodTool({
  name: "get_sample",
  description:
    "Dettaglio di un campione: analisi contenute, risultati inseriti e stato del pagamento " +
    "collegato. Serve l'id del campione — se non lo hai, usa prima search_global o list_samples.",
  inputSchema: z.object({
    sampleId: z.string().min(1),
  }),
  run: async ({ sampleId }) => {
    const sample = await getSample(sampleId);
    if (!sample) return toolResult({ found: false });

    const paymentSummary = sample.paymentId ? await getLinkedPaymentSummary(sample.paymentId) : null;

    return toolResult({
      found: true,
      id: sample.id,
      code: sample.code,
      sampleName: sample.sampleName,
      clientName: sample.clientNameSnapshot,
      status: sample.status,
      receivedAt: formatDate(sample.receivedAt),
      ageDays: ageDaysFromISO(sample.createdAt),
      analyses: sample.items.map((it) => ({
        code: it.analysisCodeSnapshot,
        name: it.analysisNameSnapshot,
        unitPrice: money(it.unitPriceCents),
        result: it.result ?? null,
      })),
      estimatedTotal: money(sample.estimatedTotalCents),
      payment: paymentSummary
        ? { status: paymentSummary.status, total: money(paymentSummary.totalAmountCents), href: `/clients/${sample.clientId}/payments` }
        : null,
      href: `/samples/${sample.id}`,
    });
  },
});

// ── list_payments ─────────────────────────────────────────────────────────

interface PaymentQueryDoc {
  id: string;
  clientId: string;
  description: string;
  status: string;
  totalAmountCents: number;
  paidAmountCents: number;
}

export const listPaymentsTool = betaZodTool({
  name: "list_payments",
  description:
    'Elenco pagamenti, filtrabile per cliente e stato ("pending", "partial", "paid", "overdue", ' +
    '"cancelled"). Utile per "chi non ha ancora pagato" (status "pending"/"overdue"). Il link di ' +
    "ogni pagamento porta alla pagina pagamenti del cliente, non a una pagina per singolo pagamento " +
    "(non esiste).",
  inputSchema: z.object({
    clientId: z.string().optional(),
    status: PaymentStatusSchema.optional(),
    limit: LimitSchema,
  }),
  run: async ({ clientId, status, limit }) => {
    await requireAdmin();

    let query = adminDb.collection("payments").where("deletedAt", "==", null) as FirebaseFirestore.Query;
    if (clientId) query = query.where("clientId", "==", clientId);
    if (status) query = query.where("status", "==", status);
    query = query.orderBy("createdAt", "desc").limit(limit ?? 20);

    const snap = await query.get();
    const docs: PaymentQueryDoc[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        clientId: (data["clientId"] as string) ?? "",
        description: (data["description"] as string) ?? "",
        status: (data["status"] as string) ?? "pending",
        totalAmountCents: (data["totalAmountCents"] as number) ?? 0,
        paidAmountCents: (data["paidAmountCents"] as number) ?? 0,
      };
    });
    const clientNames = await resolveClientNames(docs.map((d) => d.clientId));

    return toolResult({
      total: docs.length,
      items: docs.map((d) => ({
        id: d.id,
        clientName: clientNames.get(d.clientId) ?? "",
        description: d.description,
        status: d.status,
        total: money(d.totalAmountCents),
        paid: money(d.paidAmountCents),
        remaining: money(Math.max(0, d.totalAmountCents - d.paidAmountCents)),
        href: d.clientId ? `/clients/${d.clientId}/payments` : "/payments",
      })),
    });
  },
});

// ── list_quotes ───────────────────────────────────────────────────────────

export const listQuotesTool = betaZodTool({
  name: "list_quotes",
  description: "Elenco preventivi, filtrabile per cliente e stato.",
  inputSchema: z.object({
    clientId: z.string().optional(),
    status: QuoteStatusSchema.optional(),
    limit: LimitSchema,
  }),
  run: async ({ clientId, status, limit }) => {
    const { items } = await getQuotes({ clientId, status });
    return toolResult({
      total: items.length,
      items: items.slice(0, limit ?? 20).map((q) => ({
        id: q.id,
        number: q.number,
        clientName: q.clientSnapshot?.displayName ?? "",
        status: q.status,
        total: money(q.totalCents),
        validUntil: q.validUntil ? formatDate(q.validUntil) : null,
        href: `/quotes/${q.id}`,
      })),
    });
  },
});

// ── list_reminders ────────────────────────────────────────────────────────

export const listRemindersTool = betaZodTool({
  name: "list_reminders",
  description: "Promemoria aperti o in scadenza, filtrabili per stato e cliente collegato.",
  inputSchema: z.object({
    status: ReminderStatusSchema.optional(),
    clientId: z.string().optional(),
    limit: LimitSchema,
  }),
  run: async ({ status, clientId, limit }) => {
    const { items } = await getReminders({ status, clientId });
    return toolResult({
      total: items.length,
      items: items.slice(0, limit ?? 20).map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description ?? null,
        status: r.status,
        dueAt: r.dueAt ? formatDate(r.dueAt) : null,
        href: "/reminders",
      })),
    });
  },
});

// ── list_analyses_catalog ─────────────────────────────────────────────────

export const listAnalysesCatalogTool = betaZodTool({
  name: "list_analyses_catalog",
  description:
    "Catalogo analisi disponibili, con categoria e prezzo di listino. Nota: un'analisi non ha " +
    "una pagina propria — quando citi un'analisi svolta su un campione, linka il campione " +
    "(usa get_sample o list_samples), non questo catalogo.",
  inputSchema: z.object({
    limit: LimitSchema,
  }),
  run: async ({ limit }) => {
    const items = await getAnalyses();
    return toolResult({
      total: items.length,
      items: items.slice(0, limit ?? 50).map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        category: a.category ?? null,
        price: money(a.defaultPriceCents),
        unit: a.unit ?? null,
        href: "/analyses",
      })),
    });
  },
});

// ── list_expenses ─────────────────────────────────────────────────────────

export const listExpensesTool = betaZodTool({
  name: "list_expenses",
  description: "Spese aziendali, filtrabili per anno, mese e categoria.",
  inputSchema: z.object({
    year: z.number().int().optional(),
    month: z.string().regex(/^(0[1-9]|1[0-2])$/).optional().describe('Mese a due cifre, es. "09"'),
    category: ExpenseCategorySchema.optional(),
    limit: LimitSchema,
  }),
  run: async ({ year, month, category, limit }) => {
    const items = await getExpenses({ year, month });
    const filtered = category ? items.filter((e) => e.category === category) : items;
    return toolResult({
      total: filtered.length,
      items: filtered.slice(0, limit ?? 20).map((e) => ({
        id: e.id,
        description: e.description,
        category: CATEGORY_LABELS[e.category],
        supplier: e.supplier ?? null,
        date: formatDate(e.date),
        total: money(e.totalCents),
        href: `/costs/expenses/${e.id}`,
      })),
    });
  },
});

// ── get_stats_summary ─────────────────────────────────────────────────────

export const getStatsSummaryTool = betaZodTool({
  name: "get_stats_summary",
  description:
    "Numeri aggregati del gestionale: incassato nel mese corrente, atteso nei prossimi 90 giorni, " +
    'scaduto, campioni attivi, preventivi in attesa, e la ripartizione mensile incassato/atteso ' +
    "per un anno (stessa fonte dati del grafico \"Entrate mensili\" di /stats — i due numeri " +
    "devono sempre coincidere).",
  inputSchema: z.object({
    year: z.number().int().optional().describe("Anno per la ripartizione mensile (default: anno corrente)"),
  }),
  run: async ({ year }) => {
    const [dashboard, monthly] = await Promise.all([getDashboardStats(), getMonthlyStats(year)]);
    return toolResult({
      incassatoMeseCorrente: money(dashboard.incassiMeseCents),
      attesoProssimi90Giorni: money(dashboard.incassiFuturiCents),
      scaduto: money(dashboard.scadutoCents),
      campioniAttivi: dashboard.campioniAttivi,
      preventiviInAttesa: dashboard.preventiviInAttesa,
      pacchettiAttivi: dashboard.pacchetttiAttivi,
      clientiTotali: dashboard.clientiTotali,
      monthly: monthly.map((m) => ({
        month: m.month,
        year: m.year,
        incassato: money(m.incassatoCents),
        atteso: money(m.attesoCents),
      })),
    });
  },
});

// ── Elenco completo ───────────────────────────────────────────────────────

export const ASSISTANT_TOOLS = [
  searchGlobalTool,
  getClientTool,
  listClientsTool,
  listSamplesTool,
  getSampleTool,
  listPaymentsTool,
  listQuotesTool,
  listRemindersTool,
  listAnalysesCatalogTool,
  listExpensesTool,
  getStatsSummaryTool,
];
