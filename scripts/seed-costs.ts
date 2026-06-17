/**
 * SEED MODULO COSTI & MARGINALITÀ — dati di test realistici
 *
 * ⚠️  AMBIENTE DI PRODUZIONE ⚠️
 * Tutti i documenti creati hanno ID con prefisso "costseed-" così che lo
 * script di rimozione (unseed-costs.ts) possa eliminare ESCLUSIVAMENTE questi
 * documenti senza mai toccare i dati reali.
 *
 * Esegui con:
 *   npm run seed:costs
 *
 * Per rimuovere SOLO questi seed:
 *   npm run seed:costs:clean
 *
 * Richiede Firebase Admin configurato (.env.local con FIREBASE_ADMIN_* compilati).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CASISTICHE COPERTE (vedi commenti inline):
 *
 *  ANALISI (per testare la tabella Pricing /costs/pricing):
 *   • A — Margine OK        (prezzo ben sopra il costo, margine ≥ target)
 *   • B — Margine basso     (sopra costo ma sotto il margine target)
 *   • C — Sotto costo (kit) (kit costoso > prezzo di listino)
 *   • D — Kit non mappato   (nessun kit collegato → costo "N/D")
 *   • E — Sotto costo (fissi)(analisi economica schiacciata dalla quota fissi)
 *
 *  COSTI FISSI (/costs/fixed):
 *   • mensile, trimestrale, annuale (test prorata) + uno INATTIVO (test filtro)
 *
 *  SPESE (/costs/expenses):
 *   • tutte le categorie: supplier_invoice, utility, maintenance, consumable, other
 *   • con e senza righe dettaglio (items)
 *   • con flag aiParsed (simula fattura letta dall'AI)
 *   • distribuite su mese corrente + mesi passati (test KPI dashboard e filtri)
 *
 *  KIT (/costs/kits):
 *   • costo/test basso, medio, alto, e altissimo (test calcolo costPerTest)
 *
 *  IMPOSTAZIONI (settings/costs):
 *   • create SOLO se non già presenti, marcate _seedManaged per rimozione sicura
 * ───────────────────────────────────────────────────────────────────────────
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
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

// ── Emulatori ─────────────────────────────────────────────────────────────────
const IS_EMULATOR = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";
if (!IS_EMULATOR) {
  console.error("❌ ABORT: NEXT_PUBLIC_USE_EMULATORS !== 'true'. Seed consentito solo su emulatori.");
  process.exit(1);
}
process.env.FIRESTORE_EMULATOR_HOST ??= "localhost:8080";
console.log("\uD83D\uDCE1 Modalità emulatore: Firestore su localhost:8080\n");

getAdminApp();
const db = getFirestore();

// ── Helpers ───────────────────────────────────────────────────────────────────
const now = Timestamp.now();

/** Prefisso univoco: l'unseed elimina SOLO i documenti il cui ID inizia così. */
const SEED_PREFIX = "costseed-";
const sid = (kind: string, n: number) =>
  `${SEED_PREFIX}${kind}-${String(n).padStart(3, "0")}`;

/** Data corrente del seed (la dashboard somma il mese in corso). */
const today = new Date();
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
/** Restituisce una data YYYY-MM-DD nel mese corrente al giorno indicato. */
const thisMonth = (day: number) =>
  ymd(new Date(today.getFullYear(), today.getMonth(), day));
/** Restituisce una data YYYY-MM-DD `n` mesi nel passato, al giorno indicato. */
const monthsAgo = (n: number, day: number) =>
  ymd(new Date(today.getFullYear(), today.getMonth() - n, day));

// ═══════════════════════════════════════════════════════════════════════════
// 1) ANALISI  (collection: analyses)
//    Necessarie per generare scenari deterministici nella tabella Pricing.
//    Prezzi scelti per coprire OK / basso / sotto-costo / kit-mancante.
// ═══════════════════════════════════════════════════════════════════════════
const ANALYSES = [
  // A — Margine OK: prezzo €40,00, kit €4,50/test, quota fissi ≈ €17,90 ⇒ margine ~44%
  {
    id: sid("an", 1),
    code: "ZSEED-SO2L",
    name: "Solforosa libera (SEED)",
    category: "Chimica base (SEED)",
    description: "Analisi seed — scenario margine OK.",
    defaultPriceCents: 4000,
    unit: "mg/L",
    active: true,
  },
  // B — Margine basso: prezzo €40,00, kit €12,00/test ⇒ margine ~25% (< target 30%)
  {
    id: sid("an", 2),
    code: "ZSEED-GRAD",
    name: "Gradazione alcolica (SEED)",
    category: "Chimica base (SEED)",
    description: "Analisi seed — scenario margine basso.",
    defaultPriceCents: 4000,
    unit: "% vol",
    active: true,
  },
  // C — Sotto costo (kit): prezzo €120,00, kit €150,00/test ⇒ negativo
  {
    id: sid("an", 3),
    code: "ZSEED-PEST",
    name: "Residui pesticidi (SEED)",
    category: "Sicurezza alimentare (SEED)",
    description: "Analisi seed — scenario sotto costo (kit costoso).",
    defaultPriceCents: 12000,
    unit: "μg/kg",
    active: true,
  },
  // D — Kit non mappato: nessun kit collegato ⇒ costo kit N/D
  {
    id: sid("an", 4),
    code: "ZSEED-SENS",
    name: "Analisi sensoriale (SEED)",
    category: "Organolettica (SEED)",
    description: "Analisi seed — nessun kit associato.",
    defaultPriceCents: 2500,
    unit: "",
    active: true,
  },
  // E — Sotto costo per quota fissi: prezzo €7,00, kit €0,20/test ma quota fissi ~€17,90
  {
    id: sid("an", 5),
    code: "ZSEED-PH",
    name: "pH (SEED)",
    category: "Chimica base (SEED)",
    description: "Analisi seed — economica, schiacciata dai costi fissi.",
    defaultPriceCents: 700,
    unit: "",
    active: true,
  },
  // F — Analisi INATTIVA: non deve comparire nel pricing (test filtro active)
  {
    id: sid("an", 6),
    code: "ZSEED-OLD",
    name: "Metodo dismesso (SEED)",
    category: "Chimica base (SEED)",
    description: "Analisi seed inattiva — non deve apparire nel pricing.",
    defaultPriceCents: 1000,
    unit: "",
    active: false,
  },
  // G — Analisi SENZA KIT associato, disponibile per import offerta
  //     Quando testi l'import, questa analisi potrà essere abbinata a una riga offerta.
  {
    id: sid("an", 7),
    code: "ZSEED-ACD",
    name: "Acidità volatile (SEED)",
    category: "Chimica base (SEED)",
    description: "Analisi seed senza kit — ideale per testare 'Nuovo' nel recap import.",
    defaultPriceCents: 1800,
    unit: "g/L",
    active: true,
  },
  // H — Altra analisi SENZA KIT, disponibile per import offerta
  {
    id: sid("an", 8),
    code: "ZSEED-FE",
    name: "Ferro (SEED)",
    category: "Minerali (SEED)",
    description: "Analisi seed senza kit — secondo slot libero per import.",
    defaultPriceCents: 2200,
    unit: "mg/L",
    active: true,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// 2) COSTI FISSI  (collection: costFixedCosts)
//    Coprono tutte e tre le frequenze + uno inattivo.
//    Totale mensile prorata (solo attivi):
//      1200,00 + 1800,00 + (960,00/12=80,00) + (2400,00/12=200,00)
//      + (900,00/3=300,00) = 3580,00 €/mese
// ═══════════════════════════════════════════════════════════════════════════
const FIXED_COSTS = [
  {
    id: sid("fc", 1),
    name: "Affitto laboratorio (SEED)",
    description: "Canone mensile locali laboratorio.",
    amountCents: 120000, // €1.200,00
    frequency: "monthly",
    active: true,
  },
  {
    id: sid("fc", 2),
    name: "Stipendio tecnico di laboratorio (SEED)",
    description: "Costo lordo mensile risorsa tecnica.",
    amountCents: 180000, // €1.800,00
    frequency: "monthly",
    active: true,
  },
  {
    id: sid("fc", 3),
    name: "Assicurazione RC professionale (SEED)",
    description: "Polizza annuale responsabilità civile.",
    amountCents: 96000, // €960,00/anno → €80,00/mese
    frequency: "annual",
    active: true,
  },
  {
    id: sid("fc", 4),
    name: "Accreditamento ACCREDIA (SEED)",
    description: "Quota annuale mantenimento accreditamento.",
    amountCents: 240000, // €2.400,00/anno → €200,00/mese
    frequency: "annual",
    active: true,
  },
  {
    id: sid("fc", 5),
    name: "Manutenzione GC-MS (SEED)",
    description: "Contratto trimestrale assistenza strumentazione.",
    amountCents: 90000, // €900,00/trim → €300,00/mese
    frequency: "quarterly",
    active: true,
  },
  {
    id: sid("fc", 6),
    name: "Software gestionale dismesso (SEED)",
    description: "Abbonamento non più attivo — test filtro inattivi.",
    amountCents: 4900, // €49,00
    frequency: "monthly",
    active: false, // INATTIVO → escluso dal prorata
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// 3) KIT  (collection: costKits)
//    costPerTestCents = round(lastPurchasePriceCents / numberOfTests)
// ═══════════════════════════════════════════════════════════════════════════
const KITS = [
  {
    id: sid("kit", 1),
    supplierArticleCode: "RG-SO2-100",
    supplierName: "Reagenti Chimici S.p.A.",
    name: "Kit Solforosa libera — 100 test (SEED)",
    analysisId: sid("an", 1),
    analysisCodeSnapshot: "ZSEED-SO2L",
    analysisNameSnapshot: "Solforosa libera (SEED)",
    numberOfTests: 100,
    lastPurchasePriceCents: 45000, // €450,00 → €4,50/test
  },
  {
    id: sid("kit", 2),
    supplierArticleCode: "RG-GRAD-50",
    supplierName: "Reagenti Chimici S.p.A.",
    name: "Kit Gradazione alcolica — 50 test (SEED)",
    analysisId: sid("an", 2),
    analysisCodeSnapshot: "ZSEED-GRAD",
    analysisNameSnapshot: "Gradazione alcolica (SEED)",
    numberOfTests: 50,
    lastPurchasePriceCents: 60000, // €600,00 → €12,00/test
  },
  {
    id: sid("kit", 3),
    supplierArticleCode: "RG-PEST-25",
    supplierName: "BioLab Forniture S.r.l.",
    name: "Kit Pesticidi LC-MS/MS — 25 test (SEED)",
    analysisId: sid("an", 3),
    analysisCodeSnapshot: "ZSEED-PEST",
    analysisNameSnapshot: "Residui pesticidi (SEED)",
    numberOfTests: 25,
    lastPurchasePriceCents: 375000, // €3.750,00 → €150,00/test
  },
  {
    id: sid("kit", 4),
    supplierArticleCode: "RG-PH-1000",
    supplierName: "ElettroLab S.r.l.",
    name: "Kit elettrodo pH — 1000 test (SEED)",
    analysisId: sid("an", 5),
    analysisCodeSnapshot: "ZSEED-PH",
    analysisNameSnapshot: "pH (SEED)",
    numberOfTests: 1000,
    lastPurchasePriceCents: 20000, // €200,00 → €0,20/test
  },
  // 5 — Kit importato da offerta (simula un import già avvenuto)
  //     Collegato ad analisi SO2-T. Ha kitOfferRef per mostrare lo storico import.
  //     Lo troviamo come "Aggiorna" se l'offerta test contiene una riga SO2-T.
  {
    id: sid("kit", 5),
    supplierArticleCode: "RG-SO2T-200",
    supplierName: "Reagenti Chimici S.p.A.",
    name: "Kit Solforosa totale — 200 test (SEED)",
    analysisId: sid("an", 2),
    analysisCodeSnapshot: "ZSEED-GRAD",
    analysisNameSnapshot: "Gradazione alcolica (SEED)",
    numberOfTests: 200,
    lastPurchasePriceCents: 58000, // €580,00 → €2,90/test
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// 4) SPESE  (collection: costExpenses)
//    Tutte le categorie, con/senza items, alcune nel mese corrente (per i KPI),
//    altre nei mesi passati (per filtri/storico).
// ═══════════════════════════════════════════════════════════════════════════
const EXPENSES = [
  // ── Mese corrente ──────────────────────────────────────────────────────────
  {
    id: sid("exp", 1),
    description: "Fornitura reagenti analisi — lotto giugno",
    category: "supplier_invoice",
    supplier: "Reagenti Chimici S.p.A.",
    invoiceNumber: "FT/2026/0451",
    date: thisMonth(4),
    totalCents: 124550, // €1.245,50
    notes: "Fattura importata e letta automaticamente dall'AI.",
    aiParsed: true,
    aiConfidence: 0.94,
    items: [
      {
        articleCode: "RG-SO2-100",
        description: "Kit Solforosa libera 100 test",
        quantity: 2,
        unitPriceCents: 45000,
        totalCents: 90000,
      },
      {
        articleCode: "VET-001",
        description: "Vetreria assortita di laboratorio",
        quantity: 1,
        unitPriceCents: 34550,
        totalCents: 34550,
      },
    ],
  },
  {
    id: sid("exp", 2),
    description: "Bolletta energia elettrica — mag-giu",
    category: "utility",
    supplier: "Enel Energia",
    invoiceNumber: "EE-2026-06-1180",
    date: thisMonth(8),
    periodFrom: monthsAgo(1, 1),  // 1° maggio
    periodTo: ymd(new Date(today.getFullYear(), today.getMonth(), 30)), // 30 giugno
    totalCents: 38990, // €389,90 → €194,95/mese
    notes: "Bimestre maggio-giugno.",
    aiParsed: false,
  },
  {
    id: sid("exp", 3),
    description: "Manutenzione ordinaria HPLC",
    category: "maintenance",
    supplier: "Agilent Service",
    invoiceNumber: "AG-2026-7741",
    date: thisMonth(10),
    totalCents: 45000, // €450,00
    notes: "Intervento programmato semestrale.",
    aiParsed: false,
  },
  {
    id: sid("exp", 4),
    description: "Materiale di consumo — vetreria e puntali",
    category: "consumable",
    supplier: "LabForniture S.r.l.",
    invoiceNumber: "LF-2026-0099",
    date: thisMonth(12),
    totalCents: 12730, // €127,30
    notes: "",
    aiParsed: false,
  },
  {
    id: sid("exp", 5),
    description: "Cancelleria e spese varie ufficio",
    category: "other",
    date: thisMonth(13),
    totalCents: 4500, // €45,00
    notes: "Spesa minore senza fornitore strutturato.",
    aiParsed: false,
  },
  // ── Mese precedente ────────────────────────────────────────────────────────
  {
    id: sid("exp", 6),
    description: "Fornitura kit pesticidi LC-MS/MS",
    category: "supplier_invoice",
    supplier: "BioLab Forniture S.r.l.",
    invoiceNumber: "BL-2026-0312",
    date: monthsAgo(1, 18),
    totalCents: 375000, // €3.750,00
    notes: "Acquisto kit ad alto costo — mese precedente.",
    aiParsed: true,
    aiConfidence: 0.88,
    items: [
      {
        articleCode: "RG-PEST-25",
        description: "Kit Pesticidi LC-MS/MS 25 test",
        quantity: 1,
        unitPriceCents: 375000,
        totalCents: 375000,
      },
    ],
  },
  {
    id: sid("exp", 7),
    description: "Bolletta gas metano — mar-apr",
    category: "utility",
    supplier: "Italgas",
    invoiceNumber: "IG-2026-05-0820",
    date: monthsAgo(1, 6),
    periodFrom: monthsAgo(3, 1),  // 1° marzo
    periodTo: monthsAgo(2, 30),   // 30 aprile
    totalCents: 21000, // €210,00 → €105,00/mese
    notes: "Bimestre marzo-aprile.",
    aiParsed: false,
  },
  // ── Due mesi fa ────────────────────────────────────────────────────────────
  {
    id: sid("exp", 8),
    description: "Taratura strumenti accreditati",
    category: "maintenance",
    supplier: "Centro Metrologico SIT",
    invoiceNumber: "SIT-2026-1120",
    date: monthsAgo(2, 22),
    totalCents: 68000, // €680,00
    notes: "Taratura annuale obbligatoria per accreditamento.",
    aiParsed: false,
  },

  // ── Spese kit_purchase (test anti-doppio-conteggio + "Kit collegati") ──────
  // 9 — kit_purchase CON linkedKitIds: deve mostrare "Kit collegati" nel dettaglio
  {
    id: sid("exp", 9),
    description: "Offerta Reagenti Chimici — SO2 libera + SO2 totale",
    category: "kit_purchase",
    supplier: "Reagenti Chimici S.p.A.",
    invoiceNumber: "OFF-2026-0088",
    date: thisMonth(2),
    totalCents: 103000, // €1.030,00
    notes: "Import da offerta fornitore — 2 kit.",
    aiParsed: true,
    aiConfidence: 0.91,
    linkedKitIds: [sid("kit", 1), sid("kit", 5)],
    kitOfferRef: "OFF-2026-0088",
  },
  // 10 — kit_purchase SENZA linkedKitIds: spesa manuale kit, NO sezione "Kit collegati"
  {
    id: sid("exp", 10),
    description: "Acquisto urgente kit pesticidi — extra budget",
    category: "kit_purchase",
    supplier: "BioLab Forniture S.r.l.",
    invoiceNumber: "BL-2026-0490",
    date: monthsAgo(1, 25),
    totalCents: 375000, // €3.750,00
    notes: "Acquisto diretto senza import offerta.",
    aiParsed: false,
  },
];

// ── Impostazioni costi (creato SOLO se assente) ──────────────────────────────
const COSTS_SETTINGS_SEED = {
  defaultMarginPercent: 30,
  estimatedMonthlyAnalyses: 200,
  productConfigPdfPath: null,
  productConfigPdfUrl: null,
  _seedManaged: true, // marcatore: l'unseed elimina il doc solo se questo è true
};

// ── Writer ────────────────────────────────────────────────────────────────────
async function seed() {
  console.log("🌱 Seed modulo Costi in corso (PRODUZIONE — solo ID 'costseed-')...\n");

  // Analisi
  const batch = db.batch();
  for (const a of ANALYSES) {
    const { id: docId, ...data } = a;
    batch.set(db.collection("analyses").doc(docId), {
      ...data,
      version: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  // Costi fissi
  for (const fc of FIXED_COSTS) {
    const { id: docId, ...data } = fc;
    batch.set(db.collection("costFixedCosts").doc(docId), {
      ...data,
      version: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  // Kit (con costPerTest calcolato)
  for (const k of KITS) {
    const { id: docId, ...data } = k;
    const costPerTestCents = Math.round(
      data.lastPurchasePriceCents / data.numberOfTests,
    );
    batch.set(db.collection("costKits").doc(docId), {
      ...data,
      costPerTestCents,
      version: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  // Spese
  for (const e of EXPENSES) {
    const { id: docId, ...data } = e;
    batch.set(db.collection("costExpenses").doc(docId), {
      pdfStoragePath: null,
      pdfUrl: null,
      ...data,
      aiParsed: data.aiParsed ?? false,
      version: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  await batch.commit();
  console.log(`✓ Analisi:      ${ANALYSES.length}`);
  console.log(`✓ Costi fissi:  ${FIXED_COSTS.length}`);
  console.log(`✓ Kit:          ${KITS.length}`);
  console.log(`✓ Spese:        ${EXPENSES.length}`);

  // Impostazioni costi — crea SOLO se non esistono già (non sovrascrive dati reali)
  const settingsRef = db.collection("settings").doc("costs");
  const settingsSnap = await settingsRef.get();
  if (!settingsSnap.exists) {
    await settingsRef.set({
      ...COSTS_SETTINGS_SEED,
      createdAt: now,
      updatedAt: now,
    });
    console.log("✓ Impostazioni: create (settings/costs) — _seedManaged");
  } else {
    console.log(
      "• Impostazioni: già presenti, NON modificate (settings/costs preservato)",
    );
  }

  console.log("\n✅ Seed completato.");
  console.log("   Vai su /costs per verificare KPI, /costs/pricing per gli scenari.");
}

seed().catch((err) => {
  console.error("❌ Seed fallito:", err);
  process.exit(1);
});
