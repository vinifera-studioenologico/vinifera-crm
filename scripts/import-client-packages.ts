/**
 * IMPORTAZIONE PACCHETTI CLIENTI DA EXCEL
 *
 * Crea clientPackages + payments + installments su Firestore
 * per i 3 pacchetti storici non ancora presenti nel sistema.
 *
 * Uso:
 *   npx tsx scripts/import-client-packages.ts            # dry-run (default)
 *   npx tsx scripts/import-client-packages.ts --apply    # scrittura reale
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";

// ── Firebase Admin ─────────────────────────────────────────────────────────────
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

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Converte "YYYY-MM-DD" in Date fine giornata (23:59:59.999). */
function civilDateToEndOfDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 23, 59, 59, 999);
}

/**
 * Distribuisce `total` centesimi su `n` rate intere.
 * Le prime (total % n) rate ricevono un centesimo in più.
 */
function splitInCents(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const rem = total % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/** Genera `count` date di scadenza distanziate di `intervalMonths` mesi ciascuna. */
function generateDueDates(firstDue: string, count: number, intervalMonths: number): Date[] {
  const dates: Date[] = [];
  let current = civilDateToEndOfDay(firstDue);
  for (let i = 0; i < count; i++) {
    dates.push(new Date(current));
    // Avanza di intervalMonths mesi
    const next = new Date(current);
    next.setMonth(next.getMonth() + intervalMonths);
    next.setHours(23, 59, 59, 999);
    current = next;
  }
  return dates;
}

// ── Dati da importare ──────────────────────────────────────────────────────────

interface PackageEntry {
  vatNumber: string;        // 11 cifre con zero iniziale
  packageName: string;      // nome esatto del template in `packages`
  totalAnalyses: number;
  remainingAnalyses: number;
  priceCents: number;
  purchaseDate: string;     // "YYYY-MM-DD"
  accontoCents: number;     // importo già pagato (= priceCents se pagato intero)
  accontoDate: string | null; // "YYYY-MM-DD" — null = usa purchaseDate
  installmentsCount: number;  // rate ESCLUSO acconto (1 = pagato intero, nessuna rata aggiuntiva)
  firstDueDate: string | null; // "YYYY-MM-DD" — null se già pagato interamente
  intervalMonths: number;     // 0 se nessuna rata
}

const ENTRIES: PackageEntry[] = [
  {
    // Pagato intero il 30/10/2025 (1 rata unica già saldata)
    vatNumber:         "02043670674",
    packageName:       "Antonini",
    totalAnalyses:     600,
    remainingAnalyses: 323,
    priceCents:        198000,   // €1.980,00
    purchaseDate:      "2025-10-30",
    accontoCents:      198000,   // = priceCents → fully paid
    accontoDate:       null,     // usa purchaseDate
    installmentsCount: 1,
    firstDueDate:      null,
    intervalMonths:    0,
  },
  {
    // Acconto €120 il 20/04/2026 + 3 rate ogni 4 mesi a partire dal 20/08/2026
    vatNumber:         "01424940672",
    packageName:       "De Antoniis Vini",
    totalAnalyses:     240,
    remainingAnalyses: 193,
    priceCents:        124800,   // €1.248,00
    purchaseDate:      "2025-01-01",
    accontoCents:      12000,    // €120,00
    accontoDate:       "2026-04-20",
    installmentsCount: 3,
    firstDueDate:      "2026-08-20",
    intervalMonths:    4,
  },
  {
    // Acconto €500 il 29/04/2026 + 3 rate ogni 4 mesi a partire dal 29/08/2026
    vatNumber:         "02288410448",
    packageName:       "Macondo",
    totalAnalyses:     300,
    remainingAnalyses: 253,
    priceCents:        156000,   // €1.560,00
    purchaseDate:      "2025-03-14",
    accontoCents:      50000,    // €500,00
    accontoDate:       "2026-04-29",
    installmentsCount: 3,
    firstDueDate:      "2026-08-29",
    intervalMonths:    4,
  },
];

// ── Lookup Firestore ───────────────────────────────────────────────────────────

async function findClientByVat(vatNumber: string) {
  const snap = await db
    .collection("clients")
    .where("vatNumber", "==", vatNumber)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0]!.id, ...(snap.docs[0]!.data() as Record<string, unknown>) };
}

async function findPackageByName(name: string) {
  const snap = await db
    .collection("packages")
    .where("name", "==", name)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0]!.id, ...(snap.docs[0]!.data() as Record<string, unknown>) };
}

/** Controlla se esiste già un clientPackage per questa coppia (clientId, packageId). */
async function existingPackage(clientId: string, packageId: string) {
  const snap = await db
    .collection("clientPackages")
    .where("clientId", "==", clientId)
    .where("packageId", "==", packageId)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0]!.id;
}

// ── Import di un singolo pacchetto ─────────────────────────────────────────────

async function importEntry(entry: PackageEntry, dryRun: boolean): Promise<void> {
  console.log(`\n── ${entry.packageName} (${entry.vatNumber}) ──`);

  // 1. Trova cliente
  const client = await findClientByVat(entry.vatNumber);
  if (!client) {
    console.error(`  ❌  Cliente non trovato con P.IVA ${entry.vatNumber}`);
    return;
  }
  const clientId = client.id;
  const clientData = client as Record<string, unknown>;
  const clientName = (clientData["displayName"] as string | undefined) ?? clientId;
  console.log(`  ✓  Cliente: ${clientName}`);

  // 2. Trova template pacchetto
  const pkg = await findPackageByName(entry.packageName);
  if (!pkg) {
    console.error(`  ❌  Template pacchetto "${entry.packageName}" non trovato`);
    return;
  }
  const packageId = pkg.id;
  console.log(`  ✓  Pacchetto template: ${entry.packageName} (${packageId})`);

  // 3. Controlla duplicati
  const existingId = await existingPackage(clientId, packageId);
  if (existingId) {
    console.warn(`  ⚠️  Già esiste un clientPackage (${existingId}) — saltato`);
    return;
  }

  // ── Calcola struttura pagamento ──────────────────────────────────────────────
  const { priceCents, accontoCents, installmentsCount: count, intervalMonths } = entry;

  // hasAcconto = acconto parziale + più di 1 rata aggiuntiva
  const hasAcconto = accontoCents > 0 && count > 1;

  // isFullyPaid: sia il caso "acconto = totale" che "pagato intero in 1 rata"
  const remaining = hasAcconto ? Math.max(0, priceCents - accontoCents) : priceCents;
  const isFullyPaid =
    (hasAcconto && remaining === 0) ||
    (count === 1 && accontoCents >= priceCents);

  const resolvedAccontoDate = entry.accontoDate ?? entry.purchaseDate;
  const accontoPaidAt = civilDateToEndOfDay(resolvedAccontoDate);
  const purchasedAt   = civilDateToEndOfDay(entry.purchaseDate);

  // Riepilogo
  console.log(`  💰 Totale: €${(priceCents / 100).toFixed(2)}`);
  if (isFullyPaid && !hasAcconto) {
    console.log(`  💰 Pagato intero il ${resolvedAccontoDate}`);
  } else if (hasAcconto) {
    console.log(`  💰 Acconto: €${(accontoCents / 100).toFixed(2)} il ${resolvedAccontoDate}`);
    console.log(`  💰 Residuo: €${(remaining / 100).toFixed(2)} su ${count} rate ogni ${intervalMonths} mesi`);
    const amounts = splitInCents(remaining, count);
    const dueDates = generateDueDates(entry.firstDueDate!, count, intervalMonths);
    dueDates.forEach((d, i) =>
      console.log(
        `       rata ${i + 1}: €${(amounts[i]! / 100).toFixed(2)} — scad. ${d.toLocaleDateString("it-IT")}`
      )
    );
  }

  if (dryRun) {
    console.log(`  ✓  [DRY-RUN] OK — nessuna scrittura`);
    return;
  }

  // ── Scrittura transazionale ─────────────────────────────────────────────────
  await db.runTransaction(async (tx) => {
    const cpRef      = db.collection("clientPackages").doc();
    const paymentRef = db.collection("payments").doc();

    // clientPackage
    tx.set(cpRef, {
      clientId,
      packageId,
      packageNameSnapshot: entry.packageName,
      totalAnalyses:       entry.totalAnalyses,
      remainingAnalyses:   entry.remainingAnalyses,
      priceCents,
      status:      "active",
      paymentId:   paymentRef.id,
      purchasedAt: Timestamp.fromDate(purchasedAt),
      createdAt:   FieldValue.serverTimestamp(),
      updatedAt:   FieldValue.serverTimestamp(),
      createdBy:   "import-script",
    });

    // payment
    const paymentPaidCents = isFullyPaid ? priceCents : (hasAcconto ? accontoCents : 0);
    const paymentStatus    = isFullyPaid ? "paid" : (hasAcconto ? "partial" : "pending");
    const paymentInstCount = hasAcconto
      ? (isFullyPaid ? 1 : count + 1) // +1 perché rata 0 = acconto
      : count;

    tx.set(paymentRef, {
      clientId,
      source:            { kind: "package", refId: cpRef.id },
      description:       `Pacchetto ${entry.packageName} – ${clientName}`,
      totalAmountCents:  priceCents,
      paidAmountCents:   paymentPaidCents,
      status:            paymentStatus,
      installmentsCount: paymentInstCount,
      version:           0,
      createdAt:         FieldValue.serverTimestamp(),
      updatedAt:         FieldValue.serverTimestamp(),
      createdBy:         "import-script",
    });

    if (isFullyPaid && !hasAcconto) {
      // Antonini: 1 unica rata già saldata
      const installRef = paymentRef.collection("installments").doc();
      tx.set(installRef, {
        index:            1,
        amountCents:      priceCents,
        paidAmountCents:  priceCents,
        dueAt:            Timestamp.fromDate(accontoPaidAt),
        paidAt:           Timestamp.fromDate(accontoPaidAt),
        status:           "paid",
        createdAt:        FieldValue.serverTimestamp(),
      });
      // Nessun aggiornamento stats: già pagato, pendingAmountCents = 0
    } else {
      // Rata 0: acconto già pagato
      if (hasAcconto) {
        const accontoRef = paymentRef.collection("installments").doc();
        tx.set(accontoRef, {
          index:           0,
          amountCents:     accontoCents,
          paidAmountCents: accontoCents,
          dueAt:           Timestamp.fromDate(accontoPaidAt),
          paidAt:          Timestamp.fromDate(accontoPaidAt),
          status:          "paid",
          createdAt:       FieldValue.serverTimestamp(),
        });
      }

      // Rate ordinarie (sul residuo)
      const amounts  = splitInCents(remaining, count);
      const dueDates = generateDueDates(entry.firstDueDate!, count, intervalMonths);

      for (let i = 0; i < count; i++) {
        const installRef = paymentRef.collection("installments").doc();
        tx.set(installRef, {
          index:           i + 1,
          amountCents:     amounts[i]!,
          paidAmountCents: 0,
          dueAt:           Timestamp.fromDate(dueDates[i]!),
          status:          "pending",
          createdAt:       FieldValue.serverTimestamp(),
        });
      }

      // Aggiorna stats cliente: solo il residuo pendente
      const clientRef = db.collection("clients").doc(clientId);
      tx.update(clientRef, {
        "stats.pendingAmountCents": FieldValue.increment(remaining),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });

  console.log(`  ✅  Importato`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

const DRY_RUN = !process.argv.includes("--apply");

async function main() {
  if (DRY_RUN) {
    console.log("\n⚠️  DRY-RUN — nessuna scrittura. Aggiungi --apply per confermare.\n");
  } else {
    console.log("\n🚀  APPLY — scrittura su Firestore\n");
  }

  for (const entry of ENTRIES) {
    await importEntry(entry, DRY_RUN);
  }

  console.log("\n✔  Done.\n");
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
