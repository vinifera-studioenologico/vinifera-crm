/**
 * SEED EVENTI — crea eventi di test, ordini e iscritti mailing list
 *
 * ⚠️  Solo su emulatori (NEXT_PUBLIC_USE_EMULATORS=true) ⚠️
 *
 * Esegui con:
 *   npm run seed:events
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";

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

// ── Helpers ───────────────────────────────────────────────────────────────────
const now = Timestamp.now();
const daysTs = (n: number) => Timestamp.fromDate(new Date(Date.now() + n * 86_400_000));
const hoursTs = (n: number) => Timestamp.fromDate(new Date(Date.now() + n * 3_600_000));

// ── ID fissi (contengono "-seed-" per riconoscerli) ──────────────────────────
const EV_DEGUSTAZIONE = "ev-seed-degustazione";
const EV_WORKSHOP     = "ev-seed-workshop";
const EV_SERATA       = "ev-seed-serata";
const EV_PASSATO      = "ev-seed-passato";

const ORD_1  = "ord-seed-001";
const ORD_2  = "ord-seed-002";
const ORD_3  = "ord-seed-003";

const SUB_1  = "sub-seed-001";
const SUB_2  = "sub-seed-002";
const SUB_3  = "sub-seed-003";

// ── Immagini Pexels (pubbliche, royalty-free) ─────────────────────────────────
const IMG_DEGUSTAZIONE =
  "https://images.pexels.com/photos/3407777/pexels-photo-3407777.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop";
const IMG_WORKSHOP =
  "https://images.pexels.com/photos/1407846/pexels-photo-1407846.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop";
const IMG_SERATA =
  "https://images.pexels.com/photos/5946640/pexels-photo-5946640.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop";
const IMG_PASSATO =
  "https://images.pexels.com/photos/2702805/pexels-photo-2702805.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop";

// ── EVENTI ────────────────────────────────────────────────────────────────────
const EVENTS = [
  {
    // 1. Degustazione guidata — a pagamento, featured, bookable
    id: EV_DEGUSTAZIONE,
    slug: "degustazione-vini-abruzzo",
    status: "published",
    title: { it: "Degustazione Guidata — Vini d'Abruzzo", en: "Guided Tasting — Wines of Abruzzo" },
    summary: {
      it: "Un viaggio sensoriale attraverso i grandi vini autoctoni abruzzesi con il nostro enologo.",
      en: "A sensory journey through the great native Abruzzo wines with our oenologist.",
    },
    description: {
      it: "Serata di degustazione guidata con introduzione alle varietà Montepulciano d'Abruzzo e Trebbiano. Abbinamenti gastronomici inclusi e visita al laboratorio. I partecipanti riceveranno una dispensa con schede di analisi sensoriale.",
      en: "Guided tasting evening introducing Montepulciano d'Abruzzo and Trebbiano varieties, with food pairings and laboratory tour. Participants receive a sensory analysis booklet.",
    },
    imageUrl: IMG_DEGUSTAZIONE,
    images: [],
    location: { name: "Vinifera Studio Enologico", address: "Via Cavour 6", city: "Garrufo (TE)" },
    startsAt: daysTs(30),      // tra 30 giorni
    endsAt: null,
    bookingOpensAt: null,      // prenotabile subito
    bookingClosesAt: daysTs(28),
    capacity: 20,
    maxSeatsPerOrder: null,
    priceCents: 3500,          // €35,00
    discountedPriceCents: null,
    featured: true,
    recurrence: null,
    recurrenceParentId: null,
    recurrenceProcessedAt: null,
    seatsSold: 6,              // 3 ordini seed di test
    seatsHeld: 0,
    subscribersNotifiedAt: now,
    cancelledAt: null,
    version: 0,
    createdBy: "seed",
  },
  {
    // 2. Workshop in cantina — gratuito, prossimamente (bookingOpensAt futuro)
    id: EV_WORKSHOP,
    slug: "workshop-cantina-autunno",
    status: "published",
    title: { it: "Workshop in Cantina — Autunno", en: "Cellar Workshop — Autumn" },
    summary: {
      it: "Workshop pratico di vinificazione: dalla gestione del mosto alle pratiche di cantina.",
      en: "Hands-on winemaking workshop: from must management to cellar practices.",
    },
    description: {
      it: "Giornata intera dedicata alle tecniche di vinificazione moderna. Il workshop è gratuito e riservato ai clienti del laboratorio e a chi ha partecipato almeno a un corso precedente.",
      en: "A full day dedicated to modern winemaking techniques. Free workshop reserved for laboratory clients and previous course attendees.",
    },
    imageUrl: IMG_WORKSHOP,
    images: [],
    location: { name: "Cantina dimostrativa Vinifera", address: "Via del Vino 12", city: "Teramo" },
    startsAt: daysTs(60),
    endsAt: null,
    bookingOpensAt: daysTs(14), // prenotazioni apriranno tra 14 giorni → "upcoming"
    bookingClosesAt: daysTs(58),
    capacity: 15,
    maxSeatsPerOrder: 3,        // gratuito → maxSeatsPerOrder obbligatorio
    priceCents: 0,              // gratuito
    discountedPriceCents: null,
    featured: false,
    recurrence: null,
    recurrenceParentId: null,
    recurrenceProcessedAt: null,
    seatsSold: 0,
    seatsHeld: 0,
    subscribersNotifiedAt: null,
    cancelledAt: null,
    version: 0,
    createdBy: "seed",
  },
  {
    // 3. Serata formativa — a pagamento con sconto, bookable
    id: EV_SERATA,
    slug: "serata-analisi-sensoriale",
    status: "published",
    title: { it: "Serata di Analisi Sensoriale", en: "Sensory Analysis Evening" },
    summary: {
      it: "Impara a leggere un vino attraverso vista, olfatto e gusto con metodiche OIV.",
      en: "Learn to read a wine through sight, smell and taste using OIV methods.",
    },
    description: {
      it: "Due ore di formazione teorico-pratica sull'analisi organolettica del vino. Il prezzo include materiale didattico, 4 campioni da 50 ml e merenda finale.",
      en: "Two hours of theoretical-practical training on organoleptic wine analysis. Price includes teaching materials, 4 x 50ml samples and a final snack.",
    },
    imageUrl: IMG_SERATA,
    images: [],
    location: { name: "Vinifera Studio Enologico", address: "Via Cavour 6", city: "Garrufo (TE)" },
    startsAt: daysTs(45),
    endsAt: null,
    bookingOpensAt: null,
    bookingClosesAt: daysTs(43),
    capacity: 12,
    maxSeatsPerOrder: 4,
    priceCents: 4500,           // €45,00 listino
    discountedPriceCents: 3500, // €35,00 promozionale
    featured: false,
    recurrence: null,
    recurrenceParentId: null,
    recurrenceProcessedAt: null,
    seatsSold: 2,
    seatsHeld: 0,
    subscribersNotifiedAt: now,
    cancelledAt: null,
    version: 0,
    createdBy: "seed",
  },
  {
    // 4. Evento passato — già concluso
    id: EV_PASSATO,
    slug: "degustazione-primavera-2026",
    status: "published",
    title: { it: "Degustazione Primavera 2026", en: "Spring Tasting 2026" },
    summary: {
      it: "Degustazione stagionale dei vini bianchi e rosati del territorio.",
      en: "Seasonal tasting of local white and rosé wines.",
    },
    description: {
      it: "Evento già concluso. Conservato nell'archivio per mostrare la sezione 'Passati' sul sito.",
      en: "Past event kept for archive purposes.",
    },
    imageUrl: IMG_PASSATO,
    images: [],
    location: { name: "Vinifera Studio Enologico", address: "Via Cavour 6", city: "Garrufo (TE)" },
    startsAt: daysTs(-20),     // 20 giorni fa
    endsAt: null,
    bookingOpensAt: null,
    bookingClosesAt: daysTs(-22),
    capacity: 18,
    maxSeatsPerOrder: null,
    priceCents: 3000,
    discountedPriceCents: null,
    featured: false,
    recurrence: null,
    recurrenceParentId: null,
    recurrenceProcessedAt: null,
    seatsSold: 14,
    seatsHeld: 0,
    subscribersNotifiedAt: now,
    cancelledAt: null,
    version: 0,
    createdBy: "seed",
  },
];

// ── ORDINI (per la degustazione) ──────────────────────────────────────────────
const ORDERS = [
  {
    id: ORD_1,
    orderNumber: "EVT-2026-0001",
    eventId: EV_DEGUSTAZIONE,
    eventSnapshot: {
      slug: "degustazione-vini-abruzzo",
      titleIt: "Degustazione Guidata — Vini d'Abruzzo",
      startsAt: daysTs(30),
      locationName: "Vinifera Studio Enologico",
    },
    seats: 2,
    unitPriceCents: 3500,
    totalCents: 7000,
    status: "paid",
    buyer: {
      firstName: "Marco",
      lastName: "Ferretti",
      email: "marco.ferretti@example.it",
      emailNormalized: "marco.ferretti@example.it",
      phone: "3331234567",
      phoneNormalized: "3331234567",
    },
    participants: [
      { firstName: "Marco", lastName: "Ferretti" },
      { firstName: "Laura", lastName: "Ferretti" },
    ],
    billing: {
      type: "private",
      firstName: "Marco",
      lastName: "Ferretti",
      taxCode: "FRRMC80A01H501Z",
      address: { street: "Via Roma 10", zip: "64100", city: "Teramo", province: "TE" },
    },
    historyConsent: { granted: true, at: now },
    locale: "it",
    holdExpiresAt: null,
    paymentIntentId: "pi_seed_test_001",
    paidAt: daysTs(-2),
    refundedAt: null,
    refundId: null,
    ip: "127.0.0.1",
    version: 0,
  },
  {
    id: ORD_2,
    orderNumber: "EVT-2026-0002",
    eventId: EV_DEGUSTAZIONE,
    eventSnapshot: {
      slug: "degustazione-vini-abruzzo",
      titleIt: "Degustazione Guidata — Vini d'Abruzzo",
      startsAt: daysTs(30),
      locationName: "Vinifera Studio Enologico",
    },
    seats: 3,
    unitPriceCents: 3500,
    totalCents: 10500,
    status: "paid",
    buyer: {
      firstName: "Giulia",
      lastName: "Bianchi",
      email: "g.bianchi@example.com",
      emailNormalized: "g.bianchi@example.com",
      phone: "3469876543",
      phoneNormalized: "3469876543",
    },
    participants: [
      { firstName: "Giulia", lastName: "Bianchi" },
      { firstName: "Luca", lastName: "Bianchi" },
      { firstName: "Sofia", lastName: "Bianchi" },
    ],
    billing: {
      type: "company",
      businessName: "Bianchi Srl",
      vatNumber: "01234567890",
      sdiCode: "AAABBB1",
      pec: null,
      taxCode: null,
      adminContactName: "Giulia Bianchi",
      address: { street: "Corso Umberto 45", zip: "65100", city: "Pescara", province: "PE" },
    },
    historyConsent: { granted: true, at: now },
    locale: "it",
    holdExpiresAt: null,
    paymentIntentId: "pi_seed_test_002",
    paidAt: daysTs(-1),
    refundedAt: null,
    refundId: null,
    ip: "127.0.0.1",
    version: 0,
  },
  {
    id: ORD_3,
    orderNumber: "EVT-2026-0003",
    eventId: EV_DEGUSTAZIONE,
    eventSnapshot: {
      slug: "degustazione-vini-abruzzo",
      titleIt: "Degustazione Guidata — Vini d'Abruzzo",
      startsAt: daysTs(30),
      locationName: "Vinifera Studio Enologico",
    },
    seats: 1,
    unitPriceCents: 3500,
    totalCents: 3500,
    status: "refunded",
    buyer: {
      firstName: "Anna",
      lastName: "Rossi",
      email: "anna.rossi@example.it",
      emailNormalized: "anna.rossi@example.it",
      phone: "3501112233",
      phoneNormalized: "3501112233",
    },
    participants: [{ firstName: "Anna", lastName: "Rossi" }],
    billing: {
      type: "private",
      firstName: "Anna",
      lastName: "Rossi",
      taxCode: "RSSNNA85T41H501W",
      address: { street: "Via Garibaldi 3", zip: "66100", city: "Chieti", province: "CH" },
    },
    historyConsent: { granted: false, at: null },
    locale: "it",
    holdExpiresAt: null,
    paymentIntentId: "pi_seed_test_003",
    paidAt: daysTs(-5),
    refundedAt: daysTs(-3),
    refundId: "re_seed_test_001",
    ip: "127.0.0.1",
    version: 1,
  },
];

// ── ISCRITTI MAILING LIST ─────────────────────────────────────────────────────
const SUBSCRIBERS = [
  {
    id: SUB_1,
    email: "marco.ferretti@example.it",
    emailNormalized: "marco.ferretti@example.it",
    status: "active",
    locale: "it",
    confirmToken: "seed-confirm-token-001-xxxxxxxxxxxxxxxx",
    unsubscribeToken: "seed-unsub-token-001-xxxxxxxxxxxxxxxxx",
    consentAt: daysTs(-10),
    confirmedAt: daysTs(-9),
    unsubscribedAt: null,
  },
  {
    id: SUB_2,
    email: "g.bianchi@example.com",
    emailNormalized: "g.bianchi@example.com",
    status: "active",
    locale: "it",
    confirmToken: "seed-confirm-token-002-xxxxxxxxxxxxxxxx",
    unsubscribeToken: "seed-unsub-token-002-xxxxxxxxxxxxxxxxx",
    consentAt: daysTs(-5),
    confirmedAt: daysTs(-4),
    unsubscribedAt: null,
  },
  {
    id: SUB_3,
    email: "newsletter.seed@example.it",
    emailNormalized: "newsletter.seed@example.it",
    status: "pending",
    locale: "en",
    confirmToken: "seed-confirm-token-003-xxxxxxxxxxxxxxxx",
    unsubscribeToken: "seed-unsub-token-003-xxxxxxxxxxxxxxxxx",
    consentAt: now,
    confirmedAt: null,
    unsubscribedAt: null,
  },
];

// ── CONTATORE ORDINI EVENTI ───────────────────────────────────────────────────
const year = new Date().getFullYear();
const ORDER_COUNTER = { id: `eventOrders-${year}`, seq: 3 };

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱 Seed eventi, ordini e iscritti...\n");

  const batch = db.batch();

  // Eventi
  for (const ev of EVENTS) {
    const { id: evId, ...evData } = ev;
    batch.set(db.collection("events").doc(evId), {
      ...evData,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deletedAt: null,
    });
  }
  console.log(`  ✓ ${EVENTS.length} eventi`);

  // Ordini
  for (const ord of ORDERS) {
    const { id: ordId, ...ordData } = ord;
    batch.set(db.collection("eventOrders").doc(ordId), {
      ...ordData,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deletedAt: null,
    });
  }
  console.log(`  ✓ ${ORDERS.length} ordini`);

  // Iscritti mailing list
  for (const sub of SUBSCRIBERS) {
    const { id: subId, ...subData } = sub;
    batch.set(db.collection("eventSubscribers").doc(subId), {
      ...subData,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  console.log(`  ✓ ${SUBSCRIBERS.length} iscritti mailing list`);

  // Contatore ordini
  batch.set(
    db.collection("counters").doc(ORDER_COUNTER.id),
    { seq: ORDER_COUNTER.seq },
    { merge: true },
  );
  console.log(`  ✓ Contatore eventOrders-${year} = ${ORDER_COUNTER.seq}`);

  await batch.commit();
  console.log("\n✅ Seed eventi completato!");
}

main().catch((err) => {
  console.error("❌ Errore:", err);
  process.exit(1);
});
