# Modulo Eventi — Checklist di test manuale

> Da eseguire in locale con Stripe test mode e `npm run dev` su entrambi i repo.
> Spunta ogni voce dopo la verifica. Ultima revisione: 2026-07-15.

---

## Cosa NON è più in questa checklist (ed è coperto da test automatici)

Gran parte delle regole di business e delle validazioni di questo modulo era già stata
estratta in funzioni pure e testata con Vitest (`npm test`, 287 test). In questa sessione
sono stati chiusi anche i pochi buchi rimasti (grace period scadenza hold, ricorrenza,
rate limit, eccedenza overbooking). Le voci di checklist che duplicavano questi test sono
state rimosse da qui sotto: se vuoi rieseguirle, lancia `npm test` invece di rifarle a mano.

Copertura per sezione (file di test → cosa dimostra):
- **§1 Validazioni form** → `src/schemas/event.test.ts`, `src/schemas/validators.event.test.ts`
  (prezzo 1–49 rifiutato, sconto ≥ prezzo, sconto su evento gratuito, `maxSeatsPerOrder`
  obbligatorio se gratuito, CF/P.IVA/SDI-o-PEC).
- **§1 Overbooking** → `src/lib/events/status.test.ts` (`computeOverbookExcess`, appena estratta
  da `events.ts` per essere testabile — verifica il caso esatto "6 posti occupati, capienza 4 → eccedenza 2").
- **§2 Fallback EN** → `vinifera-site/src/lib/events.test.ts` (`localiseEvent`).
- **§3 Resume hold** → `src/server/public/checkout-logic.test.ts` (`shouldResumePendingOrder`,
  copre "riusa PI se scade tra >60s", "non riusarlo se manca <60s").
- **§3/§6 Idempotenza webhook** → `src/app/api/stripe/webhook/handlers.test.ts`
  (`decidePaymentIntentSucceeded`/`decideChargeRefunded`: "già paid/refunded → no-op").
- **§5 Scadenza hold** → `functions/src/event-logic.test.ts` (**nuovo**, prima assente: `shouldReleaseHold`
  con grace period, incluso il caso limite a 90s esatti).
- **§6 Rimborsi/cancellazioni** → `src/server/actions/event-refund-logic.test.ts`
  (`categorizeOrdersForCancellation`, `computeTotalRefundCents`, `deduplicateBuyerEmails` —
  copre esattamente lo scenario misto "1 ordine pagato + 1 gratuito" e "stesso acquirente,
  2 ordini → 1 sola email").
- **§7 Mailing list** → `src/server/public/subscriber-logic.test.ts`
  (`decideSubscribeAction`: create/resend/re-subscribe/noop; `shouldNotifySubscribers`: guard
  anti-doppio-invio).
- **§8 Storico acquirenti** → `src/server/actions/event-buyers-logic.test.ts`
  (`groupOrdersByBuyer`: match per email, per telefono, transitivo, esclusione senza consenso).
- **§8 Dashboard entrate** → `src/server/actions/event-stats-logic.test.ts`
  (`computeEventStats`, `aggregateStatsByMonth`: netto, rimborsi, ticket medio null sui gratuiti).
- **§9 Rate limit** → `src/server/public/rate-limit-logic.test.ts` (**nuovo**: verifica esattamente
  "6ª richiesta IP bloccata", "4ª richiesta email bloccata").
- **§9 Honeypot** → `src/server/public/checkout-logic.test.ts` (`isHoneypot`).
- **§9 API pubblica senza auth** → `src/lib/api-key.test.ts` (`verifyApiKey`).
- **§10 Ricorrenza** → `functions/src/event-logic.test.ts` (**nuovo**: `computeNextOccurrence`,
  `buildNewEventSlug` — verifica lo shift di 1 mese e la sostituzione dello slug).

⚠️ Nota sui test lato sito (`vinifera-site`): alcuni test esistenti (`checkout.test.ts`,
`subscribe.test.ts`) ridefiniscono la logica localmente nel file di test invece di importarla
dal modulo di produzione (es. `computeCountdown` e `CheckoutPayloadSchema` sono duplicati, non
importati). Passano, ma non garantiscono che il componente reale si comporti allo stesso modo:
trattali come documentazione della regola attesa, non come prova sul codice live.

## Cosa resta necessariamente manuale (e perché)

Non automatizzabile senza un investimento separato (Playwright + orchestrazione webhook Stripe
+ emulatore Firestore per la concorrenza):
- Tutto ciò che richiede occhi su un browser reale: colori dei badge, animazione dello slide-in
  del banner, presenza del JSON-LD nel sorgente HTML, layout mobile.
- Il flusso di pagamento Stripe Payment Element vero e proprio (iframe ospitato da Stripe).
- La ricezione effettiva di una email (contenuto, assenza di duplicati) — solo Resend/la casella
  di posta possono confermarlo.
- Attese temporali reali (countdown che scade, hold TTL) e l'invocazione reale della Cloud
  Function/emulatore.
- La concorrenza reale sull'ultimo posto: richiede due richieste HTTP simultanee contro
  Firestore vero (o emulatore) — automatizzabile in futuro con un test di integrazione dedicato,
  ma non con unit test puri.

Se in futuro vuoi investire in automazione end-to-end (Playwright + Stripe CLI + emulatore),
fammelo sapere: è un progetto a parte, non una singola sessione.

---

## Setup prerequisiti

- [X] CRM (`vinifera-crm`) avviato su `http://localhost:3000` con `NEXT_PUBLIC_DEV_BYPASS_AUTH=true`
- [X] Sito (`vinifera-site`) avviato su porta diversa (es. 3001)
- [X] `stripe listen --forward-to localhost:3000/api/stripe/webhook` attivo in un terminale
- [X] `STRIPE_WEBHOOK_SECRET` nel `.env.local` del CRM corrisponde al secret stampato da Stripe CLI
- [X] Almeno un evento creato nel CRM (vedi §1)

---

## §1 — CRM: gestione eventi (M1)

### Creazione
- [X] Creo un evento **a pagamento**: titolo IT+EN, data futura, location, capienza 10, prezzo €30,00
- [X] Creo un evento **gratuito**: attivo lo switch "Evento gratuito", inserisco `maxSeatsPerOrder: 4`
- [x] **Slug duplicato rifiutato**: provo a creare un secondo evento con lo stesso slug → errore inline
- [X] Evento creato sempre in stato **Bozza** (badge grigio outline)

### Pubblicazione e stati
- [x] "Pubblica" → stato passa a Published, badge "Prenotabile" (se data ok)
- [x] "Nascondi" → torna a Bozza
- [x] Il badge sul sito si aggiorna entro ~5 minuti (o subito se revalidation funziona)

### Riduzione capienza con overbooking
- [x] Con 3 ordini paid (6 posti) riduco la capienza a 4 → salva, appare alert arancione nell'interfaccia
      (il calcolo dell'eccedenza è testato — verifica solo la resa UI)
- [ ] Notifica Telegram/email admin ricevuta (se configurata in Settings)

### Upload immagine
- [x] Carico un'immagine dalla scheda evento → URL viene popolato, anteprima visibile
- [x] "Rimuovi" cancella l'immagine da Storage e azzera il campo

### Archivio
- [x] "Archivia" → evento sparisce dalla lista principale
- [x] Toggle "Mostra archiviati" → appare
- [x] "Ripristina" → torna visibile

---

## §2 — Sito: catalogo eventi (M2)

### Lista `/it/eventi`
- [x] Lista eventi mostra eventi futuri nella sezione "Prossimi eventi"
- [x] Badge `bookable` → sfondo verde primario, testo dorato
- [x] Badge `upcoming` → sfondo dorato, testo verde
- [x] Badge `sold_out` → sfondo rosso vino, testo bianco
- [x] Badge `past` → sfondo grigio muted
- [x] Evento gratuito mostra **"Gratuito"** (mai "0,00 €")

### Dettaglio `/it/eventi/[slug]`
- [x] Hero, titolo, data, luogo, prezzo renderizzati correttamente
- [x] Prezzo scontato → prezzo pieno barrato + prezzo scontato
- [x] Evento gratuito → "Gratuito" al posto del prezzo (mai cifre)
- [x] CTA "Prenota" visibile solo se `bookable`
- [x] CTA "Prenota" assente se `upcoming`, `sold_out`, `past`
- [x] JSON-LD `Event` presente nella sorgente (Ctrl+U → cerca `application/ld+json`)

### Banner home
- [x] Evento `featured: true` e `bookable` → banner slide-in visibile in homepage
- [x] Click sulla X → banner scompare e non riappare nella stessa sessione del browser
- [x] Riaprendo la tab o in sessione nuova → banner riappare
- [x] Nessun evento featured/bookable → nessun banner (nessun elemento vuoto)

### Versione EN
- [x] `/en/eventi` mostra testi in inglese (titoli, badge, CTA)

---

## §3 — Checkout: evento a pagamento (M3 + M4)

### Flusso completo
- [x] Step 1: seleziono 2 posti — massimo rispettato (frecce e digitazione bloccate al max)
- [x] Step 2: acquirente + 2 partecipanti + checkbox consenso storico (facoltativa)
- [x] Step 3: profilo fatturazione **Privato** con CF valido (es. `RSSMRA85T10A562S`)
- [x] Step 3: profilo fatturazione **Azienda** — compilo P.IVA + SDI o PEC (almeno uno)
- [x] Step 4: Payment Element visibile, countdown mm:ss visibile e decrescente
- [x] Carta test: `4242 4242 4242 4242`, scadenza `12/29`, CVC `123`
- [x] Pagamento → redirect a `/esito?order_id=…`
- [x] Pagina esito mostra "Prenotazione confermata!", numero ordine, posti, totale
- [x] Email conferma ricevuta (controlla casella o log Resend)
- [x] Nel terminale Stripe CLI: evento `payment_intent.succeeded` ricevuto

### Verifica nel CRM
- [x] CRM → `/events/[id]/orders` → ordine visibile con stato "Pagato" (badge verde)
- [x] Drawer ordine: acquirente, partecipanti, profilo fatturazione completo
- [x] Bottone "Copia dati fatturazione" → copia testo strutturato negli appunti
- [x] `seatsSold` incrementato correttamente sull'evento

### Resume hold
- [x] Inizio checkout, arrivo al Payment Element ma NON pago
- [x] Refresh della pagina → ripeto i primi step con **stessa email** sullo **stesso evento**
- [x] → Non crea un secondo hold: riusa il PaymentIntent esistente (campo `publishable_hint: "resume"`)
- [x] Countdown ricomincia dal tempo residuo, non da 15 minuti

### Pagamento fallito
- [x] Carta declinata: `4000 0000 0000 0002`
- [x] Messaggio di errore visibile, countdown continua
- [x] L'utente può riprovare con un'altra carta

### Idempotenza webhook (smoke test — la garanzia è già coperta da test unitari)
- [x] Dal terminale Stripe CLI copia l'ID dell'evento `payment_intent.succeeded` (es. `evt_xxx`)
- [x] Esegui `stripe events resend evt_xxx`
- [x] Nel CRM: `seatsSold` NON cambia, nessuna email duplicata

---

## §4 — Checkout: evento gratuito (M3)

- [x] Step 1: seleziono posti ≤ `maxSeatsPerOrder` → ok; > max → valore clampato istantaneamente
- [x] Step 2: acquirente + partecipanti (nessun step fatturazione)
- [x] Submit → redirect immediato a `/esito` (nessun Payment Element, nessun countdown)
- [x] Pagina esito: "Prenotazione confermata!", totale mostra "Gratuito"
- [x] Email conferma ricevuta (senza menzione di ricevuta Stripe)
- [x] CRM: ordine `paid` con `totalCents: 0`, `paymentIntentId: null`, `billing: null`
- [x] `seatsSold` incrementato, `seatsHeld` MAI toccato
- [x] Nessun PaymentIntent nella dashboard Stripe test

---

## §5 — Scadenza hold (M3 + M5)

> Per questo test abbassa temporaneamente `HOLD_TTL_MINUTES` a `1` in `src/server/public/events.ts`
> (il grace period di 90s applicato da `shouldReleaseHold` è già coperto da test — qui verifichi
> solo il comportamento reale con Cloud Function/emulatore)

- [X] Avvio checkout a pagamento, arrivo al Payment Element, **aspetto 1 minuto + ~90 secondi**
- [X] Countdown mostra 00:00 → appare schermata "Prenotazione scaduta"
- [X] La Cloud Function (o emulatore) cancella il PaymentIntent
- [X] CRM: ordine passa a `expired`, `seatsHeld` decrementato
- [X] CTA "Ricomincia" porta alla pagina evento

---

## §6 — Rimborsi e cancellazioni (M6)

### Rimborso manuale singolo
- [x] CRM → ordine `paid` a pagamento → Drawer → "Rimborsa ordine"
- [x] Stripe CLI mostra `charge.refunded`
- [x] Ordine passa a `refunded`, `seatsSold` decrementato
- [x] Badge event si aggiorna (posti tornano disponibili)

### Annullamento ordine gratuito
- [x] CRM → ordine `paid` gratuito → Drawer → "Annulla prenotazione"
- [x] Ordine passa a `cancelled`, `seatsSold` decrementato immediatamente (senza webhook)
- [x] Nessuna chiamata Stripe (verificabile: nessun evento nella CLI)

### Cancellazione evento con rimborsi (misto)
- [x] Creo un evento con 1 ordine a pagamento + 1 gratuito
- [x] CRM → dettaglio evento → "Cancella evento con rimborsi"
- [x] Dialog mostra dettagli → confermo
- [x] Evento sparisce dal sito
- [x] Ordine a pagamento → Stripe CLI mostra `charge.refunded` → stato `refunded`
- [x] Ordine gratuito → stato `cancelled` immediato, senza Stripe
- [x] Email corrette inviate a entrambi gli acquirenti (uno riceve menzione rimborso, l'altro no)

### "Notifica tutti"
- [x] CRM → dettaglio evento con almeno 1 ordine paid → sezione "Notifica tutti"
- [x] Scrivo oggetto + testo → "Invia a tutti"
- [x] Email ricevuta dall'acquirente (e da eventuali altri, deduplicati per email)

---

## §7 — Mailing list (M7)

### Iscrizione
- [X] Sito → `/it/eventi` → form "Tienimi aggiornato"
- [x] CRM → `/events/subscribers` → iscritto visibile con stato "Attivo"

### Disiscrizione
- [ ] Ogni email della mailing list contiene link "Disiscrivi"
- [ ] Click → `/it/eventi/disiscrizione?token=…` → "Disiscrizione completata"
- [ ] CRM → iscritto ora con stato "Disiscritto"

### Re-iscrizione
- [ ] Compilo di nuovo il form con la stessa email → nuova email di conferma
- [ ] Dopo conferma → stato torna "Attivo"

### Notifica nuovo evento
- [ ] Pubblico un evento già bookable (o con `bookingOpensAt` nullo)
- [ ] Iscritti `active` ricevono email "Nuovo evento disponibile"

### Export CSV
- [ ] CRM → `/events/subscribers` → "Esporta CSV" → file scaricato con email degli attivi

### Rimozione GDPR
- [ ] CRM → iscritto → "Rimuovi (GDPR)" → stato passa a "Disiscritto"

---

## §8 — Ordini, storico acquirenti, statistiche (M8)

### Vista ordini per evento
- [ ] CRM → `/events/[id]/orders` → tabella con tutti gli ordini dell'evento
- [ ] Click riga → Drawer con: acquirente, partecipanti, fatturazione, riferimento Stripe
- [ ] Ordine **gratuito**: sezione fatturazione NON compare, nessun link Stripe
- [ ] Ordine **a pagamento**: fatturazione presente, link PI a Stripe dashboard
- [ ] Totale ordine gratuito mostra "Gratuito" (non "0,00 €")

### Storico acquirenti
- [ ] CRM → `/events/buyers` → tabella acquirenti raggruppati (verifica solo la resa UI —
      l'algoritmo di raggruppamento è testato)

### Dashboard entrate
- [ ] CRM → `/events/stats` → KPI totali (netto, partecipanti, ordini)
- [ ] Grafico mensile presente (barre per mese)
- [ ] Tabella per evento: lordo, rimborsato, netto, riempimento %, ticket medio

---

## §9 — Sicurezza e casi limite

### Concorrenza sull'ultimo posto
- [ ] Evento con capienza 1, avvio due checkout in parallelo (due browser/tab)
- [ ] Solo uno ottiene l'hold → l'altro riceve 409 "Non ci sono abbastanza posti"

---

## §10 — Ricorrenza (M5 — Cloud Function)

> Verificabile solo con `npm run emulators` o in staging — lo shift della data e la generazione
> dello slug sono già coperti da test (`functions/src/event-logic.test.ts`); qui verifichi solo
> l'orchestrazione reale della Cloud Function.

- [ ] Evento con `recurrence: { rule: "monthly", interval: 1 }`, `startsAt` nel passato
- [ ] Dopo la prima invocazione di `checkEvents`: nuovo evento in `draft` con slug `slug-base-YYYY-MM-DD`
- [ ] Admin riceve notifica Telegram "Nuovo evento creato in bozza"
- [ ] Seconda invocazione: **nessun duplicato** (guard `recurrenceProcessedAt`)

---

## Note finali

- **Stripe CLI** deve restare attivo durante tutti i test a pagamento
- Per resettare la sessione banner: DevTools → Application → Session Storage → cancella `vinifera_event_banner_dismissed`
- Per resettare il rate limit in locale: riavvia il dev server del CRM (i rate limit Firestore persistono; i limiti in-memory del sito si azzerano al riavvio)
- Se un test fallisce su cose non previste, controlla prima i log nel terminale del CRM
