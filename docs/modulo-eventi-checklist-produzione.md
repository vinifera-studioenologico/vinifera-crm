# Modulo Eventi — Checklist go-live produzione

> Obiettivo: passare da Stripe test mode (locale) a Stripe live mode in produzione, su
> `vinifera-crm` (Vercel + Firebase) e `vinifera-site` (**Firebase App Hosting**, non Vercel —
> corretto dopo verifica di `apphosting.yaml`). Basata sul codice attuale del branch
> `feature/events-module` in entrambi i repo (stesso nome branch) — `npm run check` verde sul CRM.

---

## 1. Account Stripe — dati da raccogliere col cliente domani

Per attivare i pagamenti **live** (non basta creare l'account, va anche "attivato" fornendo
questi dati — altrimenti resta in modalità solo-test anche con chiavi live):

- [ ] **Ragione sociale / nome attività** e forma giuridica (ditta individuale, SRL, ecc.)
- [ ] **Partita IVA** e codice ATECO dell'attività (laboratorio analisi enologiche / eventi)
- [ ] **Indirizzo sede legale**
- [ ] **Rappresentante legale**: nome, cognome, data di nascita, codice fiscale, indirizzo di
      residenza, documento d'identità (fronte/retro, da caricare su Stripe)
- [ ] **IBAN** del conto su cui ricevere i payout Stripe
- [ ] **URL sito pubblico** (Stripe lo richiede per l'attivazione) → `https://www.viniferastudioenologico.it`
      (dominio prod confermato in `apphosting.yaml`)
- [ ] **Email e telefono pubblici** di supporto (mostrati al cliente finale in caso di
      contestazione/chargeback)
- [ ] **Statement descriptor** (max 22 caratteri, appare nell'estratto conto di chi paga, es.
      `VINIFERA STUDIO`)
- [ ] Eventualmente **visura camerale** se società (Stripe può richiederla in fase di verifica)

Senza questi dati Stripe tiene i pagamenti "in sospeso" o rifiuta l'attivazione — meglio
compilarli subito in presenza del cliente piuttosto che scoprirlo dopo il deploy.

---

## 2. Chiavi e webhook Stripe (live mode)

Il modulo usa **Payment Element** (non Checkout Sessions): `src/server/public/checkout.ts`
crea un `PaymentIntent` con `automatic_payment_methods: { enabled: true }`, il sito lo mostra
via `@stripe/react-stripe-js` (`CheckoutClient.tsx` in `vinifera-site`).

- [ ] Attivare **live mode** sul dashboard Stripe (toggle in alto a sinistra)
- [ ] Copiare **Secret key live** (`sk_live_...`) → `STRIPE_SECRET_KEY`
- [ ] Copiare **Publishable key live** (`pk_live_...`) → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
      (va sul sito, non sul CRM)
- [ ] Creare un **webhook endpoint** live: Dashboard → Developers → Webhooks → Add endpoint
  - URL: `https://crm.viniferastudioenologico.it/api/stripe/webhook` (dominio prod CRM, confermato
    da `CRM_API_URL` in `apphosting.yaml` del sito)
  - Eventi da selezionare (esattamente questi 4, sono gli unici gestiti in
    `src/app/api/stripe/webhook/route.ts`):
    - `payment_intent.succeeded`
    - `payment_intent.payment_failed`
    - `payment_intent.canceled`
    - `charge.refunded`
  - Copiare il **Signing secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`
- [ ] Se si vuole abilitare **Apple Pay** (Google Pay non richiede nulla): Dashboard → Settings →
      Payment methods → Apple Pay → registrare `www.viniferastudioenologico.it` (dominio dove viene
      montato il Payment Element)
- [ ] Verificare metodi di pagamento abilitati in Dashboard → Settings → Payment methods (almeno
      carte attive)
- [ ] Attivare l'invio delle **ricevute email automatiche** (Dashboard → Settings → Customer
      emails → "Successful payments"): il `PaymentIntent` ha `receipt_email` valorizzato
      (`checkout.ts:431`), ma **non parte in test mode** — va attivato esplicitamente in live
      (nota già nella spec tecnica, §E)

---

## 3. Env var da impostare — CRM (`vinifera-crm`, Vercel prod)

| Variabile | Valore | Note |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` | usata da `src/lib/stripe.ts` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | dal webhook creato al punto 2 |
| `CRM_API_KEY` | stringa segreta condivisa | **deve essere identica** su CRM e sito — genera un valore nuovo per prod, non riusare quello di dev/test |
| `SITE_URL` | `https://www.viniferastudioenologico.it` | usata da `triggerSiteRevalidation()` e dalle notifiche overbooking (`src/server/actions/events.ts:543`) |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | — | già esistenti per altre feature, ma verifica che il dominio mittente sia verificato su Resend — altrimenti le email di conferma ordine (`src/server/events-emails.ts`) non partono |

Queste probabilmente esistono già in produzione per altre funzionalità (leads, servizi) — verifica
solo che siano coerenti, non serve ricrearle da zero.

## 3bis. Env var — `vinifera-site` (Firebase App Hosting, `apphosting.yaml`)

⚠️ Qui il meccanismo è diverso dal CRM: non è una dashboard Vercel, le env var sono **dichiarate
nel file `apphosting.yaml`** (committato nel repo) e il deploy avviene tramite il repo GitHub
collegato ad App Hosting (push/merge sul branch collegato → rollout automatico), non con un
comando manuale.

Ho controllato `apphosting.yaml` attuale: la maggior parte è **già a posto** in produzione —

| Variabile | Stato in `apphosting.yaml` | Note |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | ✅ già impostata (`https://www.viniferastudioenologico.it`) | |
| `CRM_API_URL` | ✅ già impostata (`https://crm.viniferastudioenologico.it`) | conferma che il dominio prod del CRM è già questo |
| `CRM_API_KEY` | ✅ già collegata a Secret Manager (`secret: crm-api-key`) | **verifica solo** che il valore in Secret Manager sia quello giusto e combaci col `CRM_API_KEY` impostato sul CRM (punto 3) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ❌ **manca**, va aggiunta | `CheckoutClient.tsx:17` la legge ma non esiste ancora come voce in `apphosting.yaml` |

- [ ] Aggiungere in `apphosting.yaml` una nuova voce (è pubblica, non un secret — va bene in chiaro
      come le altre `NEXT_PUBLIC_*`):
  ```yaml
  - variable: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    value: pk_live_...
    availability:
      - BUILD
      - RUNTIME
  ```
- [ ] Committare e pushare/mergiare sul branch collegato ad App Hosting per far partire il rollout
      (verificare su Firebase Console → App Hosting quale branch è collegato, se non è ovvio)
- [ ] Verificare in Firebase Console → Secret Manager che `crm-api-key` abbia il valore live
      corretto (stesso `CRM_API_KEY` del punto 3, non quello di dev/test)

⚠️ `CRM_API_KEY` resta il punto più facile da sbagliare: se non combacia esattamente tra i due
progetti, checkout/iscrizioni/servizi rispondono 401 in silenzio (nessun errore visibile
all'utente finale).

---

## 4. Firebase Cloud Function `checkEvents` — secrets separati

`functions/src/index.ts` aggiunge una **nuova** scheduled function (`checkEvents`, ogni minuto)
che rilascia gli hold scaduti e cancella i PaymentIntent scaduti. Ha bisogno di secrets **propri**,
indipendenti da quelli su Vercel (stesso valore, ma vanno impostati a parte):

- [ ] `firebase functions:secrets:set STRIPE_SECRET_KEY` (stessa `sk_live_...` di sopra)
- [ ] `firebase functions:secrets:set CRM_API_KEY` (stesso valore di sopra)
- [ ] Il parametro `SITE_URL` (`defineString`, non secret) va impostato — CLI te lo chiede
      interattivamente al deploy, oppure via `functions/.env` (`SITE_URL=https://...`)
- [ ] Deploy: `npm --prefix functions run build && firebase deploy --only functions`
  - Questo ridistribuisce sia `checkEvents` (nuova) sia `checkReminders` (esistente) — non sono
    coperte dalla CI di questo repo né dal deploy Vercel, vanno deployate a mano

## 5. Firestore rules & indexes

Il branch aggiunge regole per `events`/`eventOrders` (`firestore.rules`, +24 righe) e 9 indici
composti nuovi (`firestore.indexes.json`, +74 righe — collections `events`, `eventOrders`,
`eventSubscribers`).

- [ ] `firebase deploy --only firestore:rules,firestore:indexes`
- [ ] Aspettare che gli indici finiscano di costruirsi (Firebase Console → Firestore → Indexes)
      **prima** di annunciare il modulo come pronto — query su indici non ancora pronti falliscono

---

## 6. Smoke test post-deploy (in produzione, con importo minimo reale)

- [ ] Creare un evento di test a pagamento con prezzo basso (es. 1€) nel CRM prod
- [ ] Completare un acquisto vero dal sito prod con una carta reale (poi rimborsarla da Stripe
      Dashboard o dal CRM)
- [ ] Verificare: email di conferma ricevuta, ordine segnato `paid` nel CRM, webhook ricevuto
      (Stripe Dashboard → webhook → tentativi recenti, status 200)
- [ ] Testare un pagamento **rifiutato** (carta test Stripe non funziona in live — usa un importo
      reale con carta valida e poi eventualmente un rimborso, oppure verifica solo il flusso
      `payment_failed` via i log)
- [ ] Verificare la notifica Telegram/email di overbooking se configurata
- [ ] Cancellare/disattivare l'evento di test prima di lasciare il sito pubblico

---

## 7. Altri due punti dalla spec tecnica (§E) da non perdere

- [ ] **TTL policy su Firestore** per la collection `rateLimits` (campo `expiresAt`) — senza,
      i documenti di rate-limit si accumulano all'infinito. Si imposta una volta con
      `gcloud firestore fields ttls update` o da Firebase Console → Firestore → TTL. Non blocca il
      go-live ma va fatto entro pochi giorni per non sporcare il DB.
- [ ] **Non tecnico, ma bloccante per la conformità**: aggiornare l'informativa privacy del sito
      (nuovi trattamenti dati: acquirente, partecipanti, profilo di fatturazione, matching
      consensuale storico acquirenti, invio dati a Stripe/Resend/eventuale commercialista) e far
      confermare alla commercialista i campi del profilo di fatturazione (CF/P.IVA/SDI/PEC) prima
      di andare live con clienti reali — segnalato esplicitamente nella spec tecnica come compito
      non di coding, facile da perdere di vista.

---

## 8. Da non dimenticare

- [ ] Il webhook e le chiavi Stripe **test** che hai in `.env.local` restano validi solo in
      locale — non toccarli, servono per continuare a sviluppare/testare dopo il go-live
- [ ] `docs/modulo-eventi-test-manuale.md` ha già la checklist funzionale (validazioni, hold,
      rimborsi, ricorrenza) — quella copre la correttezza della logica, non il go-live: usa
      questo documento in aggiunta, non al posto di quello
- [ ] I domini prod (`crm.viniferastudioenologico.it` e `www.viniferastudioenologico.it`) sono già
      quelli configurati oggi in `apphosting.yaml` — se dovessero cambiare, aggiorna sia
      `SITE_URL`/`CRM_API_URL` sia il dominio Apple Pay su Stripe
