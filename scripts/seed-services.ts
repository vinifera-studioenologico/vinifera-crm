/**
 * SEED SERVIZI — importa i 4 servizi mock nel Firestore
 *
 * ⚠️  Solo su emulatori (NEXT_PUBLIC_USE_EMULATORS=true) ⚠️
 *
 * Esegui con:
 *   npx tsx scripts/seed-services.ts
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

const IS_EMULATOR = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";
if (!IS_EMULATOR) {
  console.error("❌ ABORT: NEXT_PUBLIC_USE_EMULATORS !== 'true'. Seed consentito solo su emulatori.");
  process.exit(1);
}
process.env.FIRESTORE_EMULATOR_HOST ??= "localhost:8080";
console.log("📡 Modalità emulatore: Firestore su localhost:8080\n");

getAdminApp();
const db = getFirestore();

const now = Timestamp.now();

// ── Dati servizi (dai mock di vinifera-site) ──────────────────────────────────
const SERVICES = [
  {
    id: "assistenza-vigna",
    slug: "assistenza-vigna",
    order: 1,
    inEvidenza: true,
    available: true,
    imageUrl:
      "https://images.pexels.com/photos/442116/pexels-photo-442116.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop",
    images: [
      "https://images.pexels.com/photos/5019999/pexels-photo-5019999.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/1407843/pexels-photo-1407843.jpeg?auto=compress&cs=tinysrgb&w=1200",
    ],
    basePrice: null,
    discountedPrice: null,
    priceLabel: null,
    title: { it: "Assistenza in Vigna", en: "Vineyard Assistance" },
    summary: {
      it: "Il vino si progetta e si costruisce in vigna: è da qui che nasce la qualità.",
      en: "Wine is designed and built in the vineyard: that is where quality begins.",
    },
    description: {
      it: "Forniamo supporto agronomico e viticolo completo, dalla gestione del suolo alla difesa fitosanitaria, dalla potatura alla vendemmia.",
      en: "We provide comprehensive agronomic and viticultural support, from soil management to phytosanitary protection, from pruning to harvest.",
    },
    benefits: {
      it: [
        "Analisi del terreno e valutazione del microclima",
        "Gestione fitosanitaria integrata e biologica",
        "Pianificazione delle lavorazioni stagionali",
        "Ottimizzazione della resa e della qualità delle uve",
      ],
      en: [
        "Soil analysis and microclimate assessment",
        "Integrated and organic phytosanitary management",
        "Seasonal work schedule planning",
        "Optimisation of yield and grape quality",
      ],
    },
    faq: {
      it: [
        { q: "Con quale cadenza viene effettuata l'assistenza in vigna?", a: "La frequenza degli interventi è modulata in base alla fase vegetativa e alle esigenze dell'azienda." },
        { q: "Lavorate anche su vigneti in conversione biologica?", a: "Sì, abbiamo esperienza specifica nella gestione di vigneti biologici e biodinamici." },
      ],
      en: [
        { q: "How often do vineyard visits take place?", a: "The frequency of visits is tailored to the growing season and the company's needs." },
        { q: "Do you work with vineyards in organic conversion?", a: "Yes, we have specific expertise in managing organic and biodynamic vineyards." },
      ],
    },
  },
  {
    id: "consulenza-enologica",
    slug: "consulenza-enologica",
    order: 2,
    inEvidenza: true,
    available: true,
    imageUrl:
      "https://images.pexels.com/photos/1407846/pexels-photo-1407846.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop",
    images: [
      "https://images.pexels.com/photos/3407777/pexels-photo-3407777.jpeg?auto=compress&cs=tinysrgb&w=1200",
    ],
    basePrice: 450,
    discountedPrice: null,
    priceLabel: { it: "a partire da", en: "from" },
    title: { it: "Consulenza Enologica", en: "Winemaking Consultancy" },
    summary: {
      it: "Un'enologia moderna nel rispetto del prodotto e del territorio.",
      en: "A modern approach to winemaking, respecting the product and the territory.",
    },
    description: {
      it: "Seguiamo l'azienda in ogni fase della vinificazione: dal ricevimento delle uve all'affinamento in cantina.",
      en: "We guide the company through every phase of winemaking: from grape reception to cellar ageing.",
    },
    benefits: {
      it: [
        "Gestione completa del processo di vinificazione",
        "Protocolli personalizzati per ogni tipologia di vino",
        "Monitoraggio continuo dei parametri in cantina",
        "Valorizzazione delle caratteristiche varietali e territoriali",
      ],
      en: [
        "Full management of the winemaking process",
        "Customised protocols for each wine type",
        "Continuous monitoring of cellar parameters",
        "Enhancement of varietal and territorial characteristics",
      ],
    },
    faq: {
      it: [
        { q: "Lavorate con cantine di qualsiasi dimensione?", a: "Sì, offriamo consulenza sia a piccole aziende familiari che a produttori di media dimensione." },
        { q: "Seguite anche vini speciali come spumanti o vendemmie tardive?", a: "Sì, abbiamo esperienza specifica nell'elaborazione di vini speciali." },
      ],
      en: [
        { q: "Do you work with wineries of all sizes?", a: "Yes, we offer consultancy to small family businesses and medium-sized producers alike." },
        { q: "Do you also support special wines like sparkling wines or late harvest?", a: "Yes, we have specific expertise in elaborating special wines." },
      ],
    },
  },
  {
    id: "analisi-enochimiche",
    slug: "analisi-enochimiche",
    order: 3,
    inEvidenza: true,
    available: true,
    imageUrl:
      "https://images.pexels.com/photos/954585/pexels-photo-954585.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop",
    images: [
      "https://images.pexels.com/photos/4116579/pexels-photo-4116579.jpeg?auto=compress&cs=tinysrgb&w=1200",
      "https://images.pexels.com/photos/3938022/pexels-photo-3938022.jpeg?auto=compress&cs=tinysrgb&w=1200",
    ],
    basePrice: 35,
    discountedPrice: 28,
    priceLabel: { it: "a partire da", en: "from" },
    title: { it: "Analisi Enochimiche", en: "Oenochemical Analyses" },
    summary: {
      it: "Laboratorio interno con metodiche ufficiali riconosciute dall'OIV.",
      en: "In-house laboratory with official OIV-recognised methods.",
    },
    description: {
      it: "Il nostro laboratorio interno esegue analisi enochimiche complete con metodiche ufficiali riconosciute dall'OIV.",
      en: "Our in-house laboratory performs complete oenochemical analyses using official methods recognised by the OIV.",
    },
    benefits: {
      it: [
        "Analisi chimiche complete su mosti e vini",
        "Metodiche ufficiali certificate OIV",
        "Referti chiari con interpretazione dei dati",
        "Tempi rapidi (24-48 ore per analisi standard)",
      ],
      en: [
        "Complete chemical analyses on musts and wines",
        "Officially certified OIV methods",
        "Clear reports with data interpretation",
        "Fast turnaround (24-48 hours for standard analyses)",
      ],
    },
    faq: {
      it: [
        { q: "Quali analisi vengono eseguite in laboratorio?", a: "Eseguiamo analisi complete su mosti e vini: titolo alcolometrico, acidità totale e volatile, pH, anidride solforosa e molto altro." },
        { q: "Quanto tempo ci vuole per ricevere i risultati?", a: "I referti standard sono disponibili entro 24-48 ore dall'arrivo del campione." },
      ],
      en: [
        { q: "What analyses are performed in the laboratory?", a: "We perform complete analyses on musts and wines: alcohol content, acidity, pH, sulphur dioxide, and more." },
        { q: "How long does it take to receive results?", a: "Standard reports are available within 24-48 hours of sample arrival." },
      ],
    },
  },
  {
    id: "perizia-legislativa",
    slug: "perizia-legislativa",
    order: 4,
    inEvidenza: false,
    available: true,
    imageUrl:
      "https://images.pexels.com/photos/5668858/pexels-photo-5668858.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop",
    images: [],
    basePrice: 180,
    discountedPrice: null,
    priceLabel: { it: "a partire da", en: "from" },
    title: { it: "Perizia Legislativa", en: "Legislative Compliance" },
    summary: {
      it: "Tenuta registri telematici e consulenza sulla normativa vitivinicola.",
      en: "Digital register management and wine sector regulatory consultancy.",
    },
    description: {
      it: "Gestiamo la tenuta dei registri telematici obbligatori e offriamo consulenza completa sulla normativa del settore vitivinicolo.",
      en: "We manage the mandatory electronic register keeping and provide comprehensive advice on wine sector regulations.",
    },
    benefits: {
      it: [
        "Tenuta registri telematici (SIAN, ICQRF)",
        "Pratiche per denominazioni DOC/DOP/IGT",
        "Consulenza normativa costantemente aggiornata",
        "Gestione documenti di accompagnamento vini",
      ],
      en: [
        "Electronic register management (SIAN, ICQRF)",
        "Applications for DOC/DOP/IGT designations",
        "Continuously updated regulatory advice",
        "Management of wine transport documents",
      ],
    },
    faq: {
      it: [
        { q: "Gestite la tenuta del registro telematico su SIAN?", a: "Sì, ci occupiamo della registrazione e dell'aggiornamento del registro telematico obbligatorio su SIAN." },
        { q: "Offrite supporto per le pratiche di riconoscimento DOC/DOP?", a: "Sì, forniamo assistenza completa per le pratiche burocratiche relative alle denominazioni di origine." },
      ],
      en: [
        { q: "Do you manage the electronic register on SIAN?", a: "Yes, we handle the registration and updating of the mandatory electronic register on SIAN." },
        { q: "Do you assist with DOC/DOP recognition applications?", a: "Yes, we provide full assistance with the bureaucratic procedures relating to designations of origin." },
      ],
    },
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱 Seeding services...\n");

  const batch = db.batch();
  const col = db.collection("services");

  for (const svc of SERVICES) {
    const { id, ...data } = svc;
    const ref = col.doc(id);
    batch.set(ref, {
      ...data,
      version: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    console.log(`  ✓ ${id}`);
  }

  await batch.commit();
  console.log(`\n✅ Seeded ${SERVICES.length} services successfully.`);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
