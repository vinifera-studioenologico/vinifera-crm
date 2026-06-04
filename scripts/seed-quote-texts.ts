#!/usr/bin/env tsx
/**
 * Popola i testi PDF preventivo nel documento settings/company.
 * Uso: npx tsx scripts/seed-quote-texts.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0]!;
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    }),
  });
}

const app = getAdminApp();
const db = getFirestore(app);

const quoteFiscalNote = [
  "Operazione senza applicazione dell\u2019IVA ai sensi dell\u2019art. 1, commi 54-89, L. 190/2014 \u2014 regime forfettario.",
  "Compenso soggetto a contributo previdenziale ENPAIA/Cassa agrotecnici nella misura indicata, da applicare sull\u2019imponibile. Il contributo \u00e8 a carico del committente ai sensi dell\u2019art. 1, c. 212, L. 662/1996.",
  "Il compenso non \u00e8 soggetto a ritenuta d\u2019acconto ai sensi dell\u2019art. 1, comma 67, L. 190/2014.",
  "L\u2019eventuale imposta di bollo su fattura elettronica (\u20ac 2,00) \u00e8 dovuta nei casi previsti dalla normativa vigente.",
].join("\n");

const quoteConditions = [
  "1. VALIDIT\u00c0 DEL PREVENTIVO\nIl presente preventivo ha validit\u00e0 30 giorni dalla data di emissione, salvo espressa proroga concordata per iscritto. Decorso tale termine, il professionista si riserva di aggiornare le condizioni economiche senza preavviso.",
  "2. AVVIO DELLE ATTIVIT\u00c0\nLe attivit\u00e0 avranno inizio previo ricevimento della presente accettazione firmata e, ove concordato, del relativo acconto. L\u2019avvio non \u00e8 subordinato a termini automatici ed \u00e8 condizionato alla ricezione di tutta la documentazione, dei campioni e delle informazioni necessarie all\u2019esecuzione dell\u2019incarico.",
  "3. ESCLUSIONI E ATTIVIT\u00c0 EXTRA\nSono escluse dal presente preventivo tutte le attivit\u00e0 non esplicitamente descritte. Qualsiasi prestazione aggiuntiva, variazione di scope o analisi supplementare non inclusa nell\u2019offerta dovr\u00e0 essere preventivamente concordata per iscritto e sar\u00e0 oggetto di separata quotazione.",
  "4. COSTI AGGIUNTIVI\nEventuali spese per trasferte, sopralluoghi in cantina, campionamenti, materiali di consumo specifici, spedizioni di campioni, analisi straordinarie o interventi urgenti non inclusi nell\u2019offerta saranno fatturati separatamente previo accordo tra le parti, sulla base dei costi effettivamente sostenuti.",
  "5. TEMPISTICHE\nLe tempistiche indicate sono da intendersi come puramente indicative in condizioni operative ordinarie. Il professionista non si assume responsabilit\u00e0 per ritardi imputabili al mancato o tardivo conferimento di campioni, dati analitici, documentazione tecnica o informazioni da parte del committente. In tali casi le scadenze potranno slittare proporzionalmente senza che ci\u00f2 costituisca inadempimento contrattuale.",
  "6. REGIME FISCALE E PREVIDENZIALE\nOperazione senza applicazione dell\u2019IVA ai sensi dell\u2019art. 1, commi 54-89, L. 190/2014 \u2014 regime forfettario. Il compenso non \u00e8 soggetto a ritenuta d\u2019acconto ai sensi dell\u2019art. 1, comma 67, L. 190/2014. Al compenso imponibile \u00e8 applicato il contributo previdenziale ENPAIA/Cassa agrotecnici al 4%, a carico del committente ai sensi dell\u2019art. 1, c. 212, L. 662/1996. L\u2019eventuale imposta di bollo su fattura elettronica (\u20ac 2,00) \u00e8 dovuta nei casi previsti dalla normativa vigente.",
  "7. RISERVATEZZA E TRATTAMENTO DEI DATI PERSONALI (GDPR)\nI dati personali del committente saranno trattati ai sensi del Regolamento UE 2016/679 (GDPR) e della normativa nazionale vigente, esclusivamente per le finalit\u00e0 connesse all\u2019esecuzione del presente incarico professionale e agli obblighi fiscali e previdenziali conseguenti. I dati non saranno comunicati a terzi, salvo i casi previsti dalla legge. Il committente ha diritto di accesso, rettifica, cancellazione e opposizione al trattamento, rivolgendosi al titolare del trattamento.",
].join("\n\n");

const quotePrivacyNote =
  "Qualora l\u2019esecuzione del servizio comporti il trattamento di dati personali per conto del cliente, le parti si impegnano a regolare separatamente i rispettivi ruoli privacy ai sensi del Regolamento UE 2016/679, anche mediante eventuale nomina a Responsabile del trattamento ove necessaria.";

const quoteAcceptanceText =
  "Il committente, con la firma del presente documento, dichiara di accettare integralmente le condizioni economiche e contrattuali del presente preventivo, nonch\u00e9 di approvare specificamente, ai sensi degli artt. 1341 e 1342 c.c., le seguenti clausole: art. 3 (esclusioni e attivit\u00e0 extra), art. 4 (costi aggiuntivi), art. 5 (tempistiche e ritardi), art. 6 (regime fiscale e previdenziale).";

async function main() {
  console.log("Scrivo i testi PDF preventivo in settings/company...");
  await db.doc("settings/company").set(
    { quoteFiscalNote, quoteConditions, quotePrivacyNote, quoteAcceptanceText },
    { merge: true },
  );
  console.log("\u2705 Testi PDF preventivo salvati con successo!");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("\u274c Errore:", err);
  process.exit(1);
});
