#!/usr/bin/env tsx
/**
 * Audit statistiche — script di SOLA LETTURA (nessuna scrittura).
 * Conta le occorrenze reali dei rischi individuati leggendo il codice per
 * docs/statistiche-spese-e-incassi.md §5. Stampa un riepilogo, non modifica nulla.
 *
 * Uso: npx tsx scripts/audit-statistiche.ts
 * Richiede .env.local con FIREBASE_ADMIN_* compilati (progetto reale).
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { toZonedTime } from "date-fns-tz";

const TZ = "Europe/Rome";

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

const db = getFirestore(getAdminApp());

async function main() {
  console.log(`Progetto: ${process.env.FIREBASE_ADMIN_PROJECT_ID}`);
  console.log(`Ora esecuzione (locale processo): ${new Date().toString()}`);
  console.log(`Timezone risolta dal processo: ${Intl.DateTimeFormat().resolvedOptions().timeZone}\n`);

  // ── Punto 1 — dueDate vs dueAt ──────────────────────────────────────────
  const installmentsSnap = await db.collectionGroup("installments").get();
  let onlyDueDate = 0;
  let onlyDueAt = 0;
  let both = 0;
  let neither = 0;
  let paidTotal = 0;
  let paidMissingPaidAmount = 0;
  let paidMissingPaidAmountIndex0 = 0;
  let paidMissingPaidAmountOther = 0;

  for (const doc of installmentsSnap.docs) {
    const d = doc.data();
    const hasDueAt = d["dueAt"] != null;
    const hasDueDate = d["dueDate"] != null;
    if (hasDueDate && !hasDueAt) onlyDueDate++;
    else if (hasDueAt && !hasDueDate) onlyDueAt++;
    else if (hasDueAt && hasDueDate) both++;
    else neither++;

    // ── Punto 2 — paidAmountCents mancante su rate "paid" ─────────────────
    if (d["status"] === "paid") {
      paidTotal++;
      if (d["paidAmountCents"] == null) {
        paidMissingPaidAmount++;
        if (d["index"] === 0) paidMissingPaidAmountIndex0++;
        else paidMissingPaidAmountOther++;
      }
    }
  }

  console.log("── Punto 1: dueDate vs dueAt ──────────────────────────────");
  console.log(`  Totale rate (installments):     ${installmentsSnap.size}`);
  console.log(`  Solo "dueAt" (writer attuale):   ${onlyDueAt}`);
  console.log(`  Solo "dueDate" (legacy, INVISIBILI a cron/statistiche): ${onlyDueDate}`);
  console.log(`  Entrambi i campi:                ${both}`);
  console.log(`  Nessuno dei due (anomalia):      ${neither}\n`);

  console.log("── Punto 2: paidAmountCents mancante su rate pagate ────────");
  console.log(`  Rate con status "paid":                    ${paidTotal}`);
  console.log(`  ...senza paidAmountCents (usano fallback):  ${paidMissingPaidAmount}`);
  console.log(`    di cui index 0 (acconto manuale):         ${paidMissingPaidAmountIndex0}`);
  console.log(`    di cui altre rate:                        ${paidMissingPaidAmountOther}\n`);

  // ── Punto 3 — spese fixed_cost generate automaticamente ────────────────
  const expensesSnap = await db
    .collection("costExpenses")
    .where("deletedAt", "==", null)
    .get();
  let fixedCostExpenses = 0;
  let fixedCostExpensesWithRef = 0;
  let fixedCostExpensesWithoutRef = 0;
  for (const doc of expensesSnap.docs) {
    const d = doc.data();
    if (d["category"] === "fixed_cost") {
      fixedCostExpenses++;
      if (d["fixedCostRef"]) fixedCostExpensesWithRef++;
      else fixedCostExpensesWithoutRef++;
    }
  }
  console.log("── Punto 3: doppio conteggio costi fissi ───────────────────");
  console.log(`  Spese totali non cancellate:               ${expensesSnap.size}`);
  console.log(`  ...categoria "fixed_cost":                  ${fixedCostExpenses}`);
  console.log(`    con fixedCostRef (generate da automatismo): ${fixedCostExpensesWithRef}`);
  console.log(`    senza fixedCostRef (inserite a mano):       ${fixedCostExpensesWithoutRef}`);
  console.log(`  (getCostsSummary esclude esplicitamente category==="fixed_cost" da totalExpensesCents — vedi costs.ts:633)\n`);

  // ── Punto 4 — installments di clienti archiviati (soft delete) ─────────
  const clientsSnap = await db.collection("clients").where("deletedAt", "!=", null).get();
  const archivedClientIds = new Set(clientsSnap.docs.map((d) => d.id));
  const paymentsSnap = await db.collection("payments").get();
  const archivedClientPaymentIds = new Set(
    paymentsSnap.docs.filter((d) => archivedClientIds.has(d.data()["clientId"])).map((d) => d.id),
  );
  let archivedPendingCents = 0;
  let archivedOverdueCents = 0;
  let archivedPendingCount = 0;
  let archivedOverdueCount = 0;
  for (const doc of installmentsSnap.docs) {
    const paymentId = doc.ref.parent.parent?.id;
    if (!paymentId || !archivedClientPaymentIds.has(paymentId)) continue;
    const d = doc.data();
    const amount = (d["amountCents"] as number) ?? 0;
    if (d["status"] === "pending") {
      archivedPendingCents += amount;
      archivedPendingCount++;
    } else if (d["status"] === "overdue") {
      archivedOverdueCents += amount;
      archivedOverdueCount++;
    }
  }
  console.log("── Punto 4: soft delete — clienti archiviati con rate aperte ─");
  console.log(`  Clienti archiviati (deletedAt != null):     ${clientsSnap.size}`);
  console.log(`  Rate "pending" residue di clienti archiviati:  ${archivedPendingCount} (${(archivedPendingCents / 100).toFixed(2)} €)`);
  console.log(`  Rate "overdue" residue di clienti archiviati:  ${archivedOverdueCount} (${(archivedOverdueCents / 100).toFixed(2)} €)`);
  console.log(`  (getDashboardStats le somma comunque in incassiFuturiCents/scadutoCents: query collectionGroup, non fa join sul cliente)\n`);

  // ── Punto 5 — confini mese/anno in UTC vs Europe/Rome ───────────────────
  // Confronto rigoroso: per ogni timestamp reale, il mese "vero" (calcolato in
  // Europe/Rome, come vede l'operatore) contro il mese che il codice attuale
  // calcola oggi (Date.getMonth() nativo, cioè nel fuso del processo Node —
  // UTC su Vercel per default, nessun TZ impostato in vercel.json).
  function monthMismatch(ts: Timestamp): boolean {
    const d = ts.toDate();
    const trueMonthKey = `${toZonedTime(d, TZ).getFullYear()}-${toZonedTime(d, TZ).getMonth()}`;
    const naiveMonthKey = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    return trueMonthKey !== naiveMonthKey;
  }

  let paidAtMismatches = 0;
  const paidAtMismatchExamples: string[] = [];
  for (const doc of installmentsSnap.docs) {
    const d = doc.data();
    const paidAt = d["paidAt"] as Timestamp | undefined;
    if (!paidAt || d["status"] !== "paid") continue;
    if (monthMismatch(paidAt)) {
      paidAtMismatches++;
      if (paidAtMismatchExamples.length < 5) paidAtMismatchExamples.push(paidAt.toDate().toISOString());
    }
  }

  const samplesSnap = await db.collection("samples").get();
  let sampleCreatedAtMismatches = 0;
  const sampleMismatchExamples: string[] = [];
  for (const doc of samplesSnap.docs) {
    const d = doc.data();
    const createdAt = d["createdAt"] as Timestamp | undefined;
    if (!createdAt) continue;
    if (monthMismatch(createdAt)) {
      sampleCreatedAtMismatches++;
      if (sampleMismatchExamples.length < 5) sampleMismatchExamples.push(createdAt.toDate().toISOString());
    }
  }

  console.log("── Punto 5: confini mese in UTC vs Europe/Rome ─────────────");
  console.log(`  Rate pagate ("paidAt") il cui mese "vero" (Rome) differisce dal mese`);
  console.log(`  che il codice attuale calcola (naive/UTC): ${paidAtMismatches} su ${paidTotal}`);
  if (paidAtMismatchExamples.length > 0) console.log(`    Esempi (paidAt UTC): ${paidAtMismatchExamples.join(", ")}`);
  console.log(`  Campioni ("createdAt") il cui mese "vero" (Rome) differisce dal mese`);
  console.log(`  che getSamplesByMonth calcola oggi (naive/UTC): ${sampleCreatedAtMismatches} su ${samplesSnap.size}`);
  if (sampleMismatchExamples.length > 0) console.log(`    Esempi (createdAt UTC): ${sampleMismatchExamples.join(", ")}`);
  console.log(`  Nota: "paidAt" delle rate è quasi sempre fine-giornata Rome (civilDateToEndOfDay, §18.4),`);
  console.log(`  quindi resta nello stesso giorno/mese UTC per costruzione — il rischio reale su paidAt è`);
  console.log(`  solo l'acconto senza data esplicita (createManualPayment usa Timestamp.now() lì, non end-of-day).`);
  console.log(`  "createdAt" dei campioni è invece un vero timestamp del momento di creazione (serverTimestamp),`);
  console.log(`  senza ancoraggio a fine giornata: è il punto realmente esposto al disallineamento UTC/Rome.\n`);

  // ── Punto 6 — version su payments mai letto/confrontato ────────────────
  console.log("── Punto 6: version su payments (concorrenza ottimistica) ──");
  console.log(`  Verifica statica del codice (non richiede query dati):`);
  console.log(`  markInstallmentPaid/markInstallmentsPaidBulk/updateInstallment/cancelInstallment`);
  console.log(`  scrivono tutti "version: FieldValue.increment(1)" senza mai leggere o confrontare`);
  console.log(`  il version corrente prima di procedere (payments.ts). Non risolto in questo audit,`);
  console.log(`  per decisione esplicita del documento.\n`);

  console.log("Fine audit. Nessuna scrittura eseguita.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Errore:", err);
    process.exit(1);
  });
