/**
 * SEED DATI DI TEST — solo per sviluppo locale
 *
 * Esegui con:
 *   npx tsx scripts/seed-dev.ts
 *
 * Richiede Firebase Admin configurato (.env.local con FIREBASE_ADMIN_* compilati)
 * oppure Firebase Emulator attivo.
 *
 * Per rimuovere i seed: elimina questo file e la riga in package.json (se aggiunta).
 */

import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// ── Inizializzazione Firebase Admin ──────────────────────────────────────────
function getAdminApp() {
  if (getApps().length > 0) return getApps()[0]!;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

getAdminApp();
const db = getFirestore();

// ── Helpers ───────────────────────────────────────────────────────────────────
const now = Timestamp.now();
const daysFromNow = (n: number) =>
  Timestamp.fromDate(new Date(Date.now() + n * 86_400_000));
const pastDays = (n: number) =>
  Timestamp.fromDate(new Date(Date.now() - n * 86_400_000));

function id(prefix: string, n: number) {
  return `${prefix}-seed-${String(n).padStart(3, "0")}`;
}

// ── Dati seed ─────────────────────────────────────────────────────────────────

// 5 Analisi
const ANALYSES = [
  {
    id: id("AN", 1),
    code: "SO2-L",
    name: "Solforosa libera",
    category: "Chimica base",
    description: "Determinazione della solforosa libera nel vino.",
    defaultPriceCents: 1200,
    unit: "mg/L",
    active: true,
  },
  {
    id: id("AN", 2),
    code: "SO2-T",
    name: "Solforosa totale",
    category: "Chimica base",
    description: "Determinazione della solforosa totale nel vino.",
    defaultPriceCents: 1500,
    unit: "mg/L",
    active: true,
  },
  {
    id: id("AN", 3),
    code: "ALK",
    name: "Acidità totale",
    category: "Chimica base",
    defaultPriceCents: 1000,
    unit: "g/L",
    active: true,
  },
  {
    id: id("AN", 4),
    code: "GRAD",
    name: "Gradazione alcolica",
    category: "Chimica base",
    defaultPriceCents: 1800,
    unit: "% vol",
    active: true,
  },
  {
    id: id("AN", 5),
    code: "PEST",
    name: "Residui pesticidi",
    category: "Sicurezza alimentare",
    description: "Screening completo residui pesticidi — metodo LC-MS/MS.",
    defaultPriceCents: 8500,
    unit: "μg/kg",
    active: true,
  },
  {
    id: id("AN", 6),
    code: "ZUCK",
    name: "Zuccheri riducenti",
    category: "Chimica base",
    defaultPriceCents: 900,
    unit: "g/L",
    active: true,
  },
  {
    id: id("AN", 7),
    code: "PH",
    name: "pH",
    category: "Chimica base",
    defaultPriceCents: 700,
    active: true,
  },
  {
    id: id("AN", 8),
    code: "ACID-VOL",
    name: "Acidità volatile",
    category: "Chimica base",
    defaultPriceCents: 1100,
    unit: "g/L",
    active: false, // inattiva — per testare il filtro
  },
];

// 3 Pacchetti template
const PACKAGES = [
  {
    id: id("PKG", 1),
    name: "Pacchetto Base Vino",
    description: "Analisi chimiche essenziali per campione vino.",
    totalAnalyses: 10,
    priceCents: 9500,
    active: true,
  },
  {
    id: id("PKG", 2),
    name: "Pacchetto Sicurezza Completo",
    description: "Chimica base + pesticidi + contaminanti.",
    totalAnalyses: 20,
    priceCents: 22000,
    active: true,
  },
  {
    id: id("PKG", 3),
    name: "Pacchetto Archivio",
    description: "Pacchetto non più disponibile.",
    totalAnalyses: 5,
    priceCents: 4000,
    active: false, // archiviato
  },
];

// 4 Clienti (2 aziende, 1 privato, 1 archiviato)
const CLIENTS = [
  {
    id: id("CL", 1),
    type: "business",
    displayName: "Cantina Rossi S.r.l.",
    email: "info@cantinarossi.it",
    phone: "+39 0735 123456",
    vatNumber: "01234567897",
    sdiCode: "SUBM70N",
    pec: "cantinarossi@pec.it",
    taxCode: "",
    address: {
      street: "Via della Vigna 12",
      city: "Ascoli Piceno",
      province: "AP",
      postalCode: "63100",
      country: "Italia",
    },
    billingAddress: null,
    notes: "Cliente storico. Predilige essere contattato via email.",
    tags: ["prioritario", "vino-rosso"],
  },
  {
    id: id("CL", 2),
    type: "business",
    displayName: "Azienda Agricola Bianchi",
    email: "lab@agricolabianchi.com",
    phone: "+39 071 987654",
    vatNumber: "09876543217",
    sdiCode: "",
    pec: "",
    taxCode: "",
    address: {
      street: "Contrada San Filippo 8",
      city: "Offida",
      province: "AP",
      postalCode: "63073",
      country: "Italia",
    },
    billingAddress: {
      street: "Via Roma 1",
      city: "Offida",
      province: "AP",
      postalCode: "63073",
      country: "Italia",
    },
    notes: "",
    tags: ["vino-bianco"],
  },
  {
    id: id("CL", 3),
    type: "individual",
    displayName: "Marco Valentini",
    firstName: "Marco",
    lastName: "Valentini",
    email: "marco.valentini@gmail.com",
    phone: "+39 333 1122334",
    taxCode: "VLNMRC85A01F158Y",
    vatNumber: "",
    address: {
      street: "Via Salaria 45",
      city: "San Benedetto del Tronto",
      province: "AP",
      postalCode: "63074",
      country: "Italia",
    },
    notes: "Piccolo produttore hobbista.",
    tags: [],
  },
  {
    id: id("CL", 4),
    type: "business",
    displayName: "Vecchia Cantina (Archiviata)",
    email: "info@vecchiacantina.it",
    phone: "+39 0736 000000",
    vatNumber: "00000000000",
    sdiCode: "",
    pec: "",
    taxCode: "",
    address: {
      street: "Via Test 0",
      city: "Ascoli Piceno",
      province: "AP",
      postalCode: "63100",
      country: "Italia",
    },
    notes: "Cliente archiviato — da usare per testare il filtro archivio.",
    tags: [],
    deletedAt: pastDays(30), // archiviato
  },
];

// Istanze pacchetto cliente (clientPackages)
const CLIENT_PACKAGES = [
  {
    id: id("CP", 1),
    clientId: id("CL", 1),
    packageId: id("PKG", 1),
    packageNameSnapshot: "Pacchetto Base Vino",
    totalAnalyses: 10,
    remainingAnalyses: 7,
    priceCents: 9500,
    status: "active",
    purchasedAt: pastDays(20),
  },
  {
    id: id("CP", 2),
    clientId: id("CL", 1),
    packageId: id("PKG", 2),
    packageNameSnapshot: "Pacchetto Sicurezza Completo",
    totalAnalyses: 20,
    remainingAnalyses: 0,
    priceCents: 22000,
    status: "exhausted",
    purchasedAt: pastDays(90),
  },
  {
    id: id("CP", 3),
    clientId: id("CL", 2),
    packageId: id("PKG", 1),
    packageNameSnapshot: "Pacchetto Base Vino",
    totalAnalyses: 10,
    remainingAnalyses: 10,
    priceCents: 9500,
    status: "active",
    purchasedAt: pastDays(5),
  },
];

// Preventivi
const QUOTES = [
  {
    id: id("QT", 1),
    number: "2026/0001",
    year: 2026,
    sequence: 1,
    clientId: id("CL", 1),
    clientSnapshot: {
      id: id("CL", 1),
      displayName: "Cantina Rossi S.r.l.",
      email: "info@cantinarossi.it",
      vatNumber: "01234567897",
      type: "business",
    },
    status: "approved",
    issuedAt: pastDays(45),
    validUntil: pastDays(15),
    items: [
      { kind: "analysis", analysisId: id("AN", 1), nameSnapshot: "Solforosa libera", quantity: 5, unitPriceCents: 1200 },
      { kind: "analysis", analysisId: id("AN", 4), nameSnapshot: "Gradazione alcolica", quantity: 5, unitPriceCents: 1800 },
    ],
    subtotalCents: 15000,
    discounts: [],
    taxes: [
      { label: "ENPAIA 4%", percent: 4, applied: true },
      { label: "IVA 22%", percent: 22, applied: false },
    ],
    totalCents: 15600,
    notes: "Preventivo per campagna vendemmia 2025.",
  },
  {
    id: id("QT", 2),
    number: "2026/0002",
    year: 2026,
    sequence: 2,
    clientId: id("CL", 2),
    clientSnapshot: {
      id: id("CL", 2),
      displayName: "Azienda Agricola Bianchi",
      email: "lab@agricolabianchi.com",
      vatNumber: "09876543217",
      type: "business",
    },
    status: "pending_approval",
    issuedAt: pastDays(5),
    validUntil: daysFromNow(25),
    items: [
      { kind: "package", packageId: id("PKG", 2), nameSnapshot: "Pacchetto Sicurezza Completo", quantity: 1, unitPriceCents: 22000 },
      { kind: "free", description: "Sopralluogo tecnico", quantity: 1, unitPriceCents: 5000 },
    ],
    subtotalCents: 27000,
    discounts: [{ label: "Sconto fedeltà", type: "percent", value: 5 }],
    taxes: [
      { label: "ENPAIA 4%", percent: 4, applied: true },
      { label: "IVA 22%", percent: 22, applied: true },
    ],
    totalCents: 33660,
    notes: "Preventivo completo con sopralluogo incluso.",
  },
  {
    id: id("QT", 3),
    number: "2026/0003",
    year: 2026,
    sequence: 3,
    clientId: id("CL", 3),
    clientSnapshot: {
      id: id("CL", 3),
      displayName: "Marco Valentini",
      email: "marco.valentini@gmail.com",
      vatNumber: "",
      type: "individual",
    },
    status: "draft",
    issuedAt: pastDays(1),
    validUntil: daysFromNow(29),
    items: [
      { kind: "analysis", analysisId: id("AN", 3), nameSnapshot: "Acidità totale", quantity: 2, unitPriceCents: 1000 },
      { kind: "analysis", analysisId: id("AN", 7), nameSnapshot: "pH", quantity: 2, unitPriceCents: 700 },
    ],
    subtotalCents: 3400,
    discounts: [],
    taxes: [
      { label: "IVA 22%", percent: 22, applied: false },
    ],
    totalCents: 3400,
    notes: "",
  },
  {
    id: id("QT", 4),
    number: "2026/0004",
    year: 2026,
    sequence: 4,
    clientId: id("CL", 1),
    clientSnapshot: {
      id: id("CL", 1),
      displayName: "Cantina Rossi S.r.l.",
      email: "info@cantinarossi.it",
      vatNumber: "01234567897",
      type: "business",
    },
    status: "rejected",
    issuedAt: pastDays(60),
    validUntil: pastDays(30),
    items: [
      { kind: "analysis", analysisId: id("AN", 5), nameSnapshot: "Residui pesticidi", quantity: 10, unitPriceCents: 8500 },
    ],
    subtotalCents: 85000,
    discounts: [],
    taxes: [
      { label: "ENPAIA 4%", percent: 4, applied: true },
    ],
    totalCents: 88400,
    notes: "Preventivo rifiutato per budget.",
  },
];

// Campioni
const SAMPLES = [
  {
    id: id("SC", 1),
    code: "C-2026-0001",
    clientId: id("CL", 1),
    clientNameSnapshot: "Cantina Rossi S.r.l.",
    sampleName: "Sangiovese IGT 2024 — Lotto A",
    receivedAt: pastDays(10),
    status: "in_progress",
    items: [
      { analysisId: id("AN", 1), analysisCodeSnapshot: "SO2-L", analysisNameSnapshot: "Solforosa libera", unitPriceCents: 1200, coveredByPackageId: id("CP", 1), chargeAnyway: false },
      { analysisId: id("AN", 2), analysisCodeSnapshot: "SO2-T", analysisNameSnapshot: "Solforosa totale", unitPriceCents: 1500, coveredByPackageId: id("CP", 1), chargeAnyway: false },
      { analysisId: id("AN", 4), analysisCodeSnapshot: "GRAD", analysisNameSnapshot: "Gradazione alcolica", unitPriceCents: 1800, coveredByPackageId: id("CP", 1), chargeAnyway: false },
    ],
    estimatedTotalCents: 0,
    notes: "Campione ricevuto con contenitore da 1L.",
  },
  {
    id: id("SC", 2),
    code: "C-2026-0002",
    clientId: id("CL", 1),
    clientNameSnapshot: "Cantina Rossi S.r.l.",
    sampleName: "Sangiovese IGT 2024 — Lotto B",
    receivedAt: pastDays(8),
    status: "completed",
    items: [
      { analysisId: id("AN", 1), analysisCodeSnapshot: "SO2-L", analysisNameSnapshot: "Solforosa libera", unitPriceCents: 1200, coveredByPackageId: id("CP", 1), chargeAnyway: false, result: "18 mg/L" },
      { analysisId: id("AN", 3), analysisCodeSnapshot: "ALK", analysisNameSnapshot: "Acidità totale", unitPriceCents: 1000, chargeAnyway: false, result: "5.8 g/L" },
    ],
    estimatedTotalCents: 0,
    notes: "",
  },
  {
    id: id("SC", 3),
    code: "C-2026-0003",
    clientId: id("CL", 2),
    clientNameSnapshot: "Azienda Agricola Bianchi",
    sampleName: "Pecorino DOC 2025 — Prima selezione",
    receivedAt: pastDays(3),
    status: "pending",
    items: [
      { analysisId: id("AN", 1), analysisCodeSnapshot: "SO2-L", analysisNameSnapshot: "Solforosa libera", unitPriceCents: 1200, coveredByPackageId: id("CP", 3), chargeAnyway: false },
      { analysisId: id("AN", 4), analysisCodeSnapshot: "GRAD", analysisNameSnapshot: "Gradazione alcolica", unitPriceCents: 1800, coveredByPackageId: id("CP", 3), chargeAnyway: false },
      { analysisId: id("AN", 6), analysisCodeSnapshot: "ZUCK", analysisNameSnapshot: "Zuccheri riducenti", unitPriceCents: 900, coveredByPackageId: id("CP", 3), chargeAnyway: false },
      { analysisId: id("AN", 5), analysisCodeSnapshot: "PEST", analysisNameSnapshot: "Residui pesticidi", unitPriceCents: 8500, chargeAnyway: true }, // fuori pacchetto, a pagamento
    ],
    estimatedTotalCents: 8500,
    notes: "Richiesta urgente — risposta entro 5 giorni lavorativi.",
  },
  {
    id: id("SC", 4),
    code: "C-2026-0004",
    clientId: id("CL", 3),
    clientNameSnapshot: "Marco Valentini",
    sampleName: "Rosso casalingo 2024",
    receivedAt: pastDays(20),
    status: "cancelled",
    items: [
      { analysisId: id("AN", 7), analysisCodeSnapshot: "PH", analysisNameSnapshot: "pH", unitPriceCents: 700, chargeAnyway: false },
    ],
    estimatedTotalCents: 700,
    cancelledAt: pastDays(18),
    cancelReason: "Cliente ha ritirato la richiesta.",
    notes: "",
  },
];

// Pagamenti
const PAYMENTS = [
  {
    id: id("PAY", 1),
    clientId: id("CL", 1),
    source: { kind: "package", refId: id("CP", 1) },
    description: "Pacchetto Base Vino — acquisto",
    totalAmountCents: 9500,
    paidAmountCents: 9500,
    status: "paid",
    installmentsCount: 1,
  },
  {
    id: id("PAY", 2),
    clientId: id("CL", 1),
    source: { kind: "package", refId: id("CP", 2) },
    description: "Pacchetto Sicurezza Completo — acquisto",
    totalAmountCents: 22000,
    paidAmountCents: 22000,
    status: "paid",
    installmentsCount: 2,
  },
  {
    id: id("PAY", 3),
    clientId: id("CL", 2),
    source: { kind: "manual" },
    description: "Saldo analisi extra campagna 2024",
    totalAmountCents: 15000,
    paidAmountCents: 5000,
    status: "partial",
    installmentsCount: 3,
  },
  {
    id: id("PAY", 4),
    clientId: id("CL", 3),
    source: { kind: "sample", refId: id("SC", 2) },
    description: "Analisi campione C-2026-0002",
    totalAmountCents: 2200,
    paidAmountCents: 0,
    status: "overdue",
    installmentsCount: 1,
  },
];

// Rate (installments) per i pagamenti sopra
const INSTALLMENTS: Array<{
  paymentId: string;
  id: string;
  index: number;
  dueDate: Timestamp;
  amountCents: number;
  status: string;
  paidAt?: Timestamp;
  paidAmountCents?: number;
  method?: string;
  note?: string;
}> = [
  // PAY-1: 1 rata pagata
  { paymentId: id("PAY", 1), id: id("INST", 1), index: 1, dueDate: pastDays(15), amountCents: 9500, status: "paid", paidAt: pastDays(14), paidAmountCents: 9500, method: "bank_transfer" },
  // PAY-2: 2 rate pagate
  { paymentId: id("PAY", 2), id: id("INST", 2), index: 1, dueDate: pastDays(80), amountCents: 11000, status: "paid", paidAt: pastDays(79), paidAmountCents: 11000, method: "bank_transfer" },
  { paymentId: id("PAY", 2), id: id("INST", 3), index: 2, dueDate: pastDays(50), amountCents: 11000, status: "paid", paidAt: pastDays(48), paidAmountCents: 11000, method: "card" },
  // PAY-3: 3 rate (1 pagata, 1 parziale, 1 scaduta)
  { paymentId: id("PAY", 3), id: id("INST", 4), index: 1, dueDate: pastDays(60), amountCents: 5000, status: "paid", paidAt: pastDays(58), paidAmountCents: 5000, method: "cash" },
  { paymentId: id("PAY", 3), id: id("INST", 5), index: 2, dueDate: pastDays(30), amountCents: 5000, status: "overdue", note: "Cliente ha chiesto proroga" },
  { paymentId: id("PAY", 3), id: id("INST", 6), index: 3, dueDate: daysFromNow(0), amountCents: 5000, status: "pending" },
  // PAY-4: 1 rata scaduta
  { paymentId: id("PAY", 4), id: id("INST", 7), index: 1, dueDate: pastDays(10), amountCents: 2200, status: "overdue" },
];

// Promemoria
const REMINDERS = [
  {
    id: id("REM", 1),
    title: "Sollecito pagamento Bianchi",
    description: "Rata scaduta da 30 giorni — chiamare il cliente.",
    dueAt: daysFromNow(0),
    relatedTo: { kind: "payment", id: id("PAY", 3) },
    status: "pending",
    remindBeforeMinutes: 60,
    notifyChannels: { telegram: true, email: false },
  },
  {
    id: id("REM", 2),
    title: "Invio referto Cantina Rossi",
    description: "Inviare PDF analisi SO2 campione Lotto B.",
    dueAt: daysFromNow(1),
    relatedTo: { kind: "sample", id: id("SC", 2) },
    status: "pending",
    notifyChannels: { telegram: false, email: true },
  },
  {
    id: id("REM", 3),
    title: "Rinnovo contratto annuale Cantina Rossi",
    dueAt: daysFromNow(30),
    relatedTo: { kind: "client", id: id("CL", 1) },
    status: "pending",
    notifyChannels: { telegram: false, email: true },
    recurrence: { rule: "yearly", interval: 1 },
  },
  {
    id: id("REM", 4),
    title: "Manutenzione strumentazione GC-MS",
    description: "Prenotare assistenza tecnica.",
    dueAt: daysFromNow(7),
    status: "pending",
    notifyChannels: { telegram: true, email: true },
  },
  {
    id: id("REM", 5),
    title: "Promemoria già fatto",
    dueAt: pastDays(5),
    status: "done",
    notifyChannels: { telegram: false, email: false },
  },
];

// Impostazioni azienda
const COMPANY_SETTINGS = {
  legalName: "Laboratorio Enologico Test S.r.l.",
  displayName: "Lab Enologico Test",
  vatNumber: "12345678903",
  taxCode: "",
  address: {
    street: "Via del Laboratorio 10",
    city: "Ascoli Piceno",
    province: "AP",
    postalCode: "63100",
    country: "Italia",
  },
  email: "info@labenologicotest.it",
  phone: "+39 0736 123456",
  pec: "labenologico@pec.it",
  iban: "IT60X0542811101000000123456",
  bankName: "Banca del Piceno",
  defaultEnpaiaPercent: 4,
  defaultVatPercent: 22,
  defaultEnpaiaApplied: true,
  pdfFooterNote: "Laboratorio accreditato ACCREDIA n. 1234 — P.IVA IT12345678901",
};

// ── Writer ────────────────────────────────────────────────────────────────────
async function seed() {
  const batch1 = db.batch();

  // Analyses
  for (const a of ANALYSES) {
    const { id: docId, ...data } = a;
    batch1.set(db.collection("analyses").doc(docId), {
      ...data,
      version: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  // Packages
  for (const p of PACKAGES) {
    const { id: docId, ...data } = p;
    batch1.set(db.collection("packages").doc(docId), {
      ...data,
      version: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  // Clients
  for (const c of CLIENTS) {
    const { id: docId, deletedAt, ...data } = c as typeof CLIENTS[0] & { deletedAt?: Timestamp };
    batch1.set(db.collection("clients").doc(docId), {
      ...data,
      stats: {
        activePackagesCount: 0,
        remainingAnalyses: 0,
        totalRevenueCents: 0,
        pendingAmountCents: 0,
        overdueAmountCents: 0,
        samplesPending: 0,
      },
      version: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: deletedAt ?? null,
    });
  }

  await batch1.commit();
  console.log("✓ Analyses, Packages, Clients");

  // ClientPackages
  const batch2 = db.batch();
  for (const cp of CLIENT_PACKAGES) {
    const { id: docId, ...data } = cp;
    batch2.set(db.collection("clientPackages").doc(docId), {
      ...data,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Quotes
  for (const q of QUOTES) {
    const { id: docId, ...data } = q;
    batch2.set(db.collection("quotes").doc(docId), {
      ...data,
      version: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  await batch2.commit();
  console.log("✓ ClientPackages, Quotes");

  // Samples
  const batch3 = db.batch();
  for (const s of SAMPLES) {
    const { id: docId, cancelledAt, cancelReason, ...data } = s as typeof SAMPLES[0] & {
      cancelledAt?: Timestamp;
      cancelReason?: string;
    };
    const doc: Record<string, unknown> = {
      ...data,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    if (cancelledAt) doc["cancelledAt"] = cancelledAt;
    if (cancelReason) doc["cancelReason"] = cancelReason;
    batch3.set(db.collection("samples").doc(docId), doc);
  }

  await batch3.commit();
  console.log("✓ Samples");

  // Payments + Installments
  const batch4 = db.batch();
  for (const pay of PAYMENTS) {
    const { id: docId, ...data } = pay;
    batch4.set(db.collection("payments").doc(docId), {
      ...data,
      version: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  for (const inst of INSTALLMENTS) {
    const { paymentId, id: instId, paidAt, paidAmountCents, method, note, ...data } = inst;
    const doc: Record<string, unknown> = {
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    if (paidAt) doc["paidAt"] = paidAt;
    if (paidAmountCents !== undefined) doc["paidAmountCents"] = paidAmountCents;
    if (method) doc["method"] = method;
    if (note) doc["note"] = note;
    batch4.set(
      db.collection("payments").doc(paymentId).collection("installments").doc(instId),
      doc,
    );
  }

  await batch4.commit();
  console.log("✓ Payments + Installments");

  // Reminders
  const batch5 = db.batch();
  for (const r of REMINDERS) {
    const { id: docId, ...data } = r;
    batch5.set(db.collection("reminders").doc(docId), {
      ...data,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Company settings
  batch5.set(db.collection("settings").doc("company"), {
    ...COMPANY_SETTINGS,
    updatedAt: now,
    createdAt: now,
  });

  await batch5.commit();
  console.log("✓ Reminders, Company Settings");

  console.log("\n✅ Seed completato:");
  console.log(`   ${ANALYSES.length} analisi  (${ANALYSES.filter(a => !a.active).length} inattive)`);
  console.log(`   ${PACKAGES.length} pacchetti  (${PACKAGES.filter(p => !p.active).length} archiviati)`);
  console.log(`   ${CLIENTS.length} clienti  (1 archiviato)`);
  console.log(`   ${CLIENT_PACKAGES.length} istanze pacchetto`);
  console.log(`   ${QUOTES.length} preventivi  (draft / pending / approved / rejected)`);
  console.log(`   ${SAMPLES.length} campioni  (pending / in_progress / completed / cancelled)`);
  console.log(`   ${PAYMENTS.length} pagamenti + ${INSTALLMENTS.length} rate`);
  console.log(`   ${REMINDERS.length} promemoria`);
  console.log(`   1 impostazioni azienda`);
}

seed().catch((err) => {
  console.error("❌ Seed fallito:", err);
  process.exit(1);
});
