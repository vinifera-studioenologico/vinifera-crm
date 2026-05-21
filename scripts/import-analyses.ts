/**
 * IMPORTAZIONE LISTINO ANALISI
 *
 * Aggiunge le analisi ufficiali al database Firestore.
 * Salta automaticamente le analisi il cui codice esiste già tra i record attivi.
 *
 * Esegui con:
 *   npm run db:import-analyses
 *
 * NOTE SUI CODICI DUPLICATI NEL LISTINO OIV:
 *   - OIV-MA-AS2-07B   → usato sia per "Antociani totali" che per "Intensità colore / Tonalità"
 *                         → seconda voce usa il codice OIV-MA-AS2-07B-2
 *   - OIV-MA-AS323-04  → usato sia per "SO2 libera" che per "SO2 totale"
 *                         → seconda voce usa il codice OIV-MA-AS323-04-T
 *   - OIV-MA-AS2-01    → usato sia per "°Babo" che per "Densità"
 *                         → seconda voce usa il codice OIV-MA-AS2-01-D
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// ── Firebase Admin ────────────────────────────────────────────────────────────
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

// ── Dati ──────────────────────────────────────────────────────────────────────
interface AnalysisInput {
  code: string;
  name: string;
  category: string;
  description: string;
  defaultPriceCents: number;
  unit?: string;
  active: boolean;
}

const ANALYSES: AnalysisInput[] = [
  // ── Componenti principali ─────────────────────────────────────────────────
  {
    code: "OIV-MA-AS315-01",
    name: "Acetaldeide",
    category: "Componenti principali",
    description: "Enzimatico automatico",
    defaultPriceCents: 1000,
    unit: "g/L",
    active: true,
  },
  {
    code: "OIV-MA-AS312-05",
    name: "Glicerolo",
    category: "Componenti principali",
    description: "Enzimatico automatico",
    defaultPriceCents: 900,
    unit: "g/L",
    active: true,
  },
  {
    code: "OIV-MA-AS311-02",
    name: "Glucosio + Fruttosio",
    category: "Componenti principali",
    description: "Enzimatico automatico",
    defaultPriceCents: 700,
    unit: "g/L",
    active: true,
  },
  {
    code: "OIV-MA-AS311-03",
    name: "Saccarosio",
    category: "Componenti principali",
    description: "Enzimatico automatico",
    defaultPriceCents: 500,
    unit: "g/L",
    active: true,
  },
  {
    code: "EST-SEC-T",
    name: "Estratto secco totale",
    category: "Componenti principali",
    description: "Bilancia idrostatica",
    defaultPriceCents: 600,
    unit: "g/L",
    active: true,
  },
  {
    code: "EST-SEC-NR",
    name: "Estratto secco non riduttore",
    category: "Componenti principali",
    description: "Calcolato da estratto totale e zuccheri riduttori, metodo interno",
    defaultPriceCents: 200,
    unit: "g/L",
    active: true,
  },
  {
    code: "CO2-DISC",
    name: "CO2 disciolta",
    category: "Componenti principali",
    description: "Strumentale tramite carbodouser",
    defaultPriceCents: 700,
    unit: "g/L",
    active: true,
  },

  // ── Acidi organici ────────────────────────────────────────────────────────
  {
    code: "OIV-MA-AS313-01",
    name: "Acidità totale",
    category: "Acidi organici",
    description: "Titrimetrico automatico",
    defaultPriceCents: 500,
    unit: "g/L",
    active: true,
  },
  {
    code: "OIV-MA-AS662C-2022",
    name: "Acidità volatile",
    category: "Acidi organici",
    description: "Enzimatico automatico",
    defaultPriceCents: 700,
    unit: "g/L",
    active: true,
  },
  {
    code: "OIV-MA-AS313-09",
    name: "Acido citrico",
    category: "Acidi organici",
    description: "Enzimatico automatico",
    defaultPriceCents: 600,
    unit: "g/L",
    active: true,
  },
  {
    code: "OIV-MA-AS313-28",
    name: "Acido D-gluconico",
    category: "Acidi organici",
    description: "Enzimatico automatico",
    defaultPriceCents: 800,
    unit: "g/L",
    active: true,
  },
  {
    code: "OIV-MA-AS313-12A",
    name: "Acido D-malico",
    category: "Acidi organici",
    description: "Enzimatico automatico",
    defaultPriceCents: 700,
    unit: "g/L",
    active: true,
  },
  {
    code: "OIV-MA-AS313-13",
    name: "Acido L-ascorbico",
    category: "Acidi organici",
    description: "Enzimatico automatico",
    defaultPriceCents: 700,
    unit: "g/L",
    active: true,
  },
  {
    code: "OIV-MA-AS313-25",
    name: "Acido lattico (L)",
    category: "Acidi organici",
    description: "Enzimatico automatico",
    defaultPriceCents: 800,
    unit: "g/L",
    active: true,
  },
  {
    code: "OIV-MA-AS313-26",
    name: "Acido L-malico",
    category: "Acidi organici",
    description: "Enzimatico automatico",
    defaultPriceCents: 800,
    unit: "g/L",
    active: true,
  },
  {
    code: "OIV-MA-AS313-04",
    name: "Acido piruvico",
    category: "Acidi organici",
    description: "Enzimatico automatico",
    defaultPriceCents: 700,
    unit: "g/L",
    active: true,
  },
  {
    code: "OIV-MA-AS313-05A",
    name: "Acido tartarico",
    category: "Acidi organici",
    description: "Enzimatico automatico",
    defaultPriceCents: 600,
    unit: "g/L",
    active: true,
  },

  // ── Solforosa ─────────────────────────────────────────────────────────────
  {
    code: "OIV-MA-AS323-04",
    name: "SO2 libera",
    category: "Solforosa",
    description: "Enzimatico automatico",
    defaultPriceCents: 500,
    unit: "mg/L",
    active: true,
  },
  {
    // Stessa norma OIV della SO2 libera — suffisso -T per renderlo univoco
    code: "OIV-MA-AS323-04-T",
    name: "SO2 totale",
    category: "Solforosa",
    description: "Enzimatico automatico",
    defaultPriceCents: 500,
    unit: "mg/L",
    active: true,
  },

  // ── Colore e polifenoli ───────────────────────────────────────────────────
  {
    code: "OIV-MA-AS2-07B",
    name: "Antociani totali",
    category: "Colore e polifenoli",
    description: "Enzimatico automatico",
    defaultPriceCents: 500,
    unit: "g/L",
    active: true,
  },
  {
    // Stessa norma OIV degli Antociani — suffisso -2 per renderlo univoco
    code: "OIV-MA-AS2-07B-2",
    name: "Intensità colore / Tonalità",
    category: "Colore e polifenoli",
    description: "Enzimatico automatico",
    defaultPriceCents: 500,
    active: true,
  },
  {
    code: "OIV-MA-AS2-09",
    name: "Catechine",
    category: "Colore e polifenoli",
    description: "Enzimatico automatico",
    defaultPriceCents: 500,
    unit: "g/L",
    active: true,
  },
  {
    code: "OIV-MA-AS2-10",
    name: "Polifenoli totali",
    category: "Colore e polifenoli",
    description: "Enzimatico automatico",
    defaultPriceCents: 500,
    active: true,
  },

  // ── Azoto ─────────────────────────────────────────────────────────────────
  {
    code: "OIV-MA-AS322-01",
    name: "Azoto ammoniacale (NH4+)",
    category: "Azoto",
    description: "Enzimatico automatico",
    defaultPriceCents: 600,
    unit: "g/L",
    active: true,
  },
  {
    code: "OIV-MA-AS391-2010",
    name: "Azoto α-ammino (NOPA)",
    category: "Azoto",
    description: "Enzimatico automatico",
    defaultPriceCents: 600,
    unit: "g/L",
    active: true,
  },

  // ── Minerali ──────────────────────────────────────────────────────────────
  {
    code: "OIV-MA-AS321-05",
    name: "Cloruri",
    category: "Minerali",
    description: "Enzimatico automatico",
    defaultPriceCents: 500,
    unit: "g/L",
    active: true,
  },
  {
    code: "CALCIO",
    name: "Calcio",
    category: "Minerali",
    description: "Enzimatico automatico",
    defaultPriceCents: 900,
    unit: "g/L",
    active: true,
  },

  // ── Parametri fisici ──────────────────────────────────────────────────────
  {
    code: "OIV-MA-AS2-08",
    name: "NTU (torbidità)",
    category: "Parametri fisici",
    description: "Nefelometrico con nefelometro",
    defaultPriceCents: 500,
    unit: "NTU",
    active: true,
  },
  {
    code: "OIV-MA-AS313-15",
    name: "pH",
    category: "Parametri fisici",
    description: "Potenziometrico tramite phmetro",
    defaultPriceCents: 500,
    active: true,
  },
  {
    code: "OIV-MA-AS312-01",
    name: "Titolo alcolometrico % vol",
    category: "Parametri fisici",
    description: "Distillazione vino + misura densimetrica del distillato",
    defaultPriceCents: 1000,
    unit: "% vol",
    active: true,
  },
  {
    code: "OIV-MA-AS2-01A",
    name: "°Brix",
    category: "Parametri fisici",
    description: "Bilancia idrostatica",
    defaultPriceCents: 500,
    unit: "°Brix",
    active: true,
  },
  {
    code: "OIV-MA-AS2-01",
    name: "°Babo",
    category: "Parametri fisici",
    description: "Bilancia idrostatica",
    defaultPriceCents: 500,
    unit: "°Babo",
    active: true,
  },
  {
    // Stessa norma OIV di °Babo — suffisso -D per renderlo univoco
    code: "OIV-MA-AS2-01-D",
    name: "Densità",
    category: "Parametri fisici",
    description: "Misura densimetrica a 20°C",
    defaultPriceCents: 500,
    unit: "g/cm³",
    active: true,
  },

  // ── Stabilità ─────────────────────────────────────────────────────────────
  {
    code: "STAB-CA",
    name: "Stabilità calcica",
    category: "Stabilità",
    description: "Metodo interno (test specifico per sali di calcio)",
    defaultPriceCents: 1000,
    unit: "µS",
    active: true,
  },
  {
    code: "STAB-PROT",
    name: "Stabilità proteica",
    category: "Stabilità",
    description: "Test a caldo, misurazione NTU nefelometrica",
    defaultPriceCents: 1000,
    unit: "NTU",
    active: true,
  },
  {
    code: "STAB-TART",
    name: "Stabilità tartarica",
    category: "Stabilità",
    description: "Test mini-contatto conduttimetrico (KHT, conducibilità) metodo interno",
    defaultPriceCents: 1000,
    unit: "µS",
    active: true,
  },
  {
    code: "STAB-P-15",
    name: "TEST STAB. PROTEICA 15",
    category: "Stabilità",
    description: "Metodo interno",
    defaultPriceCents: 700,
    unit: "NTU",
    active: true,
  },
  {
    code: "STAB-P-20",
    name: "TEST STAB. PROTEICA 20",
    category: "Stabilità",
    description: "Metodo interno",
    defaultPriceCents: 700,
    unit: "NTU",
    active: true,
  },
  {
    code: "STAB-P-30",
    name: "TEST STAB. PROTEICA 30",
    category: "Stabilità",
    description: "Metodo interno",
    defaultPriceCents: 700,
    unit: "NTU",
    active: true,
  },
  {
    code: "STAB-P-40",
    name: "TEST STAB. PROTEICA 40",
    category: "Stabilità",
    description: "Metodo interno",
    defaultPriceCents: 700,
    unit: "NTU",
    active: true,
  },
  {
    code: "STAB-P-50",
    name: "TEST STAB. PROTEICA 50",
    category: "Stabilità",
    description: "Metodo interno",
    defaultPriceCents: 700,
    unit: "NTU",
    active: true,
  },
  {
    code: "STAB-T",
    name: "TEST STAB. TARTARICA",
    category: "Stabilità",
    description: "Test mini-contatto per stabilità tartarica, metodo interno",
    defaultPriceCents: 700,
    unit: "µS",
    active: true,
  },
  {
    code: "BENT-DOSE",
    name: "DOSE CONSIGLIATA DI BENTONITE",
    category: "Stabilità",
    description: "Determinata dalle prove scalari di stabilità proteica — risultato applicativo",
    defaultPriceCents: 0, // Prezzo da definire
    unit: "g/hL",
    active: true,
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const now = Timestamp.now();
  console.log(`Importazione ${ANALYSES.length} analisi...\n`);

  // Legge le analisi già presenti (solo record attivi)
  const existingSnap = await db
    .collection("analyses")
    .where("deletedAt", "==", null)
    .get();
  // Chiave composita code+name per evitare falsi positivi su OIV code condivisi
  const existingKeys = new Set(
    existingSnap.docs.map((d) => `${d.data()["code"] as string}|${d.data()["name"] as string}`),
  );

  const toInsert = ANALYSES.filter((a) => {
    const key = `${a.code}|${a.name}`;
    if (existingKeys.has(key)) {
      console.log(`  Skip (già presente): ${a.code} — ${a.name}`);
      return false;
    }
    return true;
  });

  if (toInsert.length === 0) {
    console.log("\nNessuna nuova analisi da inserire.");
    return;
  }

  // Batch write (max 500 per batch)
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = db.batch();
    const chunk = toInsert.slice(i, i + 500);
    for (const a of chunk) {
      const docRef = db.collection("analyses").doc();
      batch.set(docRef, {
        ...a,
        version: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }
    await batch.commit();
    inserted += chunk.length;
  }

  console.log(`\n✓ Inserite: ${inserted}  Saltate: ${ANALYSES.length - inserted}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
