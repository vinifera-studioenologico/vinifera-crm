# Modulo Eventi — Specifica tecnica esecutiva

> Fonte prodotto: `docs/modulo-eventi-brainstorming.md` (decisioni chiuse, NON ridiscuterle).
> Questo documento traduce quelle decisioni in moduli tecnici indipendenti, uno per sessione
> Claude Code (Sonnet). Ogni sessione riceve: questo file (o il solo modulo + §A/§B), e implementa
> **solo** il proprio modulo, rispettando i criteri di accettazione.
>
> Repo coinvolti: `vinifera-crm` (CRM, Vercel) e `vinifera-site` (sito, Firebase App Hosting).
> Sono due repo separati: **mai** modificare l'uno lavorando nell'altro. I moduli indicano
> esplicitamente in quale repo si lavora.

---

## A. Decisioni tecniche chiuse in questa specifica

| Tema | Decisione | Motivazione |
|---|---|---|
| Stripe: Checkout vs Payment Element | **Payment Element embedded** nella pagina di checkout del sito | Il countdown dell'hold deve essere visibile in tempo reale (decisione di prodotto, stile TicketOne): impossibile su Stripe Checkout hosted. Il Payment Element dà pieno controllo su countdown, schermata di scadenza dedicata e form condizionale Privato/Azienda |
| TTL hold | **15 minuti** (`HOLD_TTL_MINUTES = 15`, costante), grace period server-side 90s | Valore indicativo del brainstorming, confermato; con Payment Element non c'è il vincolo dei 30 min minimi di Stripe Checkout |
| Modello disponibilità | Contatori denormalizzati sull'evento (`seatsSold`, `seatsHeld`) aggiornati **solo in transazione Firestore** | Serializza gli accessi concorrenti, niente race sull'ultimo posto |
| Stato evento | Stored: `draft \| published \| cancelled`. Lo stato pubblico (`upcoming/bookable/sold_out/past/cancelled`) è **derivato a runtime** da date + contatori | Nessuna dipendenza dallo scheduler per la correttezza; auto-rimozione dal banner "in evidenza" gratis (derivata) |
| Prezzi evento | **Centesimi interi** (`priceCents`, `discountedPriceCents`), minimo 50 (minimo Stripe €0,50) **oppure `priceCents === 0` = evento gratuito** | I soldi girano davvero via Stripe. NB: deroga consapevole rispetto ai servizi, che salvano euro (solo display) |
| Eventi gratuiti (`priceCents === 0`) | **Percorso separato senza Stripe**: niente PaymentIntent, niente Payment Element, niente hold/TTL/countdown (nessun pagamento da abbandonare), niente profilo di fatturazione. La prenotazione si conferma **immediatamente** in una transazione Firestore che verifica la capienza e incrementa direttamente `seatsSold`. Restano: dati acquirente (email/telefono), partecipanti, `maxSeatsPerOrder`, email conferma Resend, storico acquirenti, badge. Un evento è gratuito **solo** via `priceCents === 0` (sconto a 0 vietato: non deve cambiare flusso silenziosamente). **`maxSeatsPerOrder` diventa OBBLIGATORIO per gli eventi gratuiti** (mentre resta facoltativo/libero per quelli a pagamento) — è l'unica difesa anti-abuso richiesta, vedi riga sotto | Richiesta cliente. La discriminante di flusso è unica e leggibile ovunque: `isFreeEvent(ev) = ev.priceCents === 0`. Cliente conferma basso volume di eventi: niente difese aggiuntive oltre al cap per ordine |
| Anti-abuso checkout | Rate-limit **persistente su Firestore** (per IP e per email) + honeypot + rate-limit in-memory lato sito come prima barriera — **stesso meccanismo per entrambi i rami, nessuna guardia aggiuntiva**. Per i gratuiti l'unica difesa specifica è il cap per-ordine dato da `maxSeatsPerOrder` (obbligatorio in quel caso, vedi riga sopra); niente dedup, niente cap cumulativo cross-ordine per email — scelta deliberata: volumi bassi, non vale la complessità (vedi §D.10) | Niente Redis nello stack; Firestore transazionale è sufficiente ai volumi attesi. Decisione cliente: preferisce un limite semplice per ordine a un sistema di guardie più elaborato |
| Scadenza hold / transizioni temporali / ricorrenza | Nuova scheduled function `checkEvents` (ogni minuto, stesso deployable `functions/`) — separata da `checkReminders` | Il brainstorming fissa la Cloud Function come sede naturale (gira ogni minuto); funzione separata per non gonfiare `checkReminders` |
| Ricorrenza | Stesso modello dei promemoria: `recurrence: {rule, interval, until?}`. A data evento passata, `checkEvents` crea la **prossima istanza in `draft`** e notifica l'admin | Riuso del pattern esistente; default conservativo (l'admin rivede e pubblica) — vedi §D.3 |
| Webhook Stripe | `POST /api/stripe/webhook` nel CRM, verifica firma con `STRIPE_WEBHOOK_SECRET`, lavoro **nuovo** (verificato: nessun webhook esiste oggi nel repo) | Deciso nel brainstorming: il CRM è l'unico proprietario del DB |
| Ricevuta acquirente | `receipt_email` sul PaymentIntent → ricevuta automatica Stripe | Decisione di prodotto. NB ops: in dashboard Stripe va attivato l'invio email ricevute (non parte in test mode) |
| Storico acquirenti | Nessuna collection dedicata: vista derivata dagli ordini, matching email/telefono normalizzati **solo tra ordini con `historyConsent.granted`** | GDPR (punto critico 5 del brainstorming); "StoricoAcquirente derivato, non tabella a sé" |
| Wire format API pubbliche | snake_case nel body, come `IncomingLeadSchema` | Coerenza col canale lead esistente |
| Route CRM | `/events` (+ sub-route), inglese come `/clients`, `/payments` | Convenzione maggioritaria del CRM (`/servizi` è l'eccezione storica) |
| Cache tag sito | Nuovo tag `events`, stesso meccanismo `revalidateTag` + push dal CRM | Riuso di `/api/revalidate` esistente (già generico sul tag) |

---

## B. Regole trasversali (valgono per OGNI modulo)

**CRM (`vinifera-crm`):**
1. Ogni Server Action: `"use server"` + `import "server-only"` (in quest'ordine) + `requireAdmin()` come primo statement. Gli endpoint pubblici usano invece `verifyApiKey()` (`src/lib/api-key.ts`) — mai `requireAdmin()`.
2. Nessun repository layer: le action parlano con `adminDb` direttamente; costante `COL` per file; converter `toXDoc()` con accesso bracket-notation (`data["field"]`).
3. Importi solo in centesimi interi via `src/lib/utils/money.ts` (`toCents`, `formatEUR`, `mulCentsByQty`).
4. Zod in `src/schemas/`, tipi via `z.infer`. Schema entità (`event.ts`) ri-esportato dal barrel `index.ts`; schemi di intake pubblico (`eventCheckout.ts`, `eventSubscriber.ts`) **non** nel barrel (come `lead.ts`).
5. Docs Firestore: `id`, `createdAt`, `updatedAt`, `deletedAt: Timestamp|null`, `version` int (OCC in transazione, vedi `updateService`).
6. `firestore.rules` e `firestore.indexes.json` aggiornati insieme alle query.
7. Mutazioni che cambiano il catalogo pubblico → `triggerSiteRevalidation("events")` (vedi M1: refactor a helper condiviso).
8. Prima di chiudere: `npm run check`.

**Sito (`vinifera-site`):**
1. Next 16: `src/proxy.ts`, NON middleware. Rotte sotto `src/app/[locale]/...`, slug identici nelle due lingue. Stringhe SOLO nei dizionari `src/i18n/dictionaries/{it,en}.json`.
2. Fetch verso il CRM: bearer `CRM_API_KEY`, pattern di `src/lib/services.ts` (fallback mock in dev, `[]` in prod se env mancanti).
3. SEO: `buildMetadata` + hreflang, JSON-LD via `src/components/seo/JsonLd`, sitemap aggiornata.
4. PostHog solo dopo consenso (mai `initPostHog()` on load).
5. Prima di chiudere: `npm run lint && npx tsc --noEmit && npm run build` (+ `npm test` dopo M2 che introduce Vitest).

**Entrambi:** leggere le guide in `node_modules/next/dist/docs/` prima di usare API Next di cui non si è certi (Next 16 ha breaking changes). Icone `lucide-react` stroke 1.75; motion breve, `prefers-reduced-motion` rispettato.

---

## M0 — Fondamenta dati (CRM): schemi, rules, indici, utilities

**Repo:** `vinifera-crm` · **Dipendenze:** nessuna · **Deps npm:** `stripe`

### Collections nuove

**`events`** (doc):
```ts
{
  id, slug,                          // slug unico tra eventi non archiviati (come services)
  status: "draft" | "published" | "cancelled",
  title:       { it: string; en: string },   // stessi helper bilingue di service.ts
  summary:     { it; en },
  description: { it; en },
  imageUrl: string, images: string[],
  location: { name: string; address: string; city: string },
  startsAt: Timestamp, endsAt: Timestamp | null,
  bookingOpensAt: Timestamp | null,   // null = prenotabile da subito dopo publish
  bookingClosesAt: Timestamp | null,  // null = fino a startsAt
  capacity: number,                   // int >= 1
  maxSeatsPerOrder: number | null,    // default null = nessun limite (decisione prodotto).
                                       // OBBLIGATORIO (>= 1) se priceCents === 0 — unica difesa anti-abuso sui gratuiti
  priceCents: number,                 // int >= 50, oppure 0 = evento gratuito (§A)
  discountedPriceCents: number | null,// int >= 50 e < priceCents; DEVE essere null se priceCents === 0
  featured: boolean,                  // "in evidenza" (banner home)
  recurrence: { rule: "daily"|"weekly"|"monthly"|"yearly"; interval: number; until?: Timestamp } | null,
  recurrenceParentId: string | null,
  recurrenceProcessedAt: Timestamp | null,   // guard: prossima istanza già creata
  seatsSold: number,                  // contatore denormalizzato (ordini paid)
  seatsHeld: number,                  // contatore denormalizzato (hold attivi)
  subscribersNotifiedAt: Timestamp | null,   // guard: mailing list già avvisata (una volta per evento)
  cancelledAt: Timestamp | null,
  version, createdAt, updatedAt, deletedAt, createdBy
}
```

**`eventOrders`** (doc):
```ts
{
  id,
  orderNumber: string,               // "EVT-2026-0001", counters/{eventOrders-YYYY} in transazione (pattern quotes)
  eventId: string,
  eventSnapshot: { slug; titleIt: string; startsAt: Timestamp; locationName: string }, // snapshot intenzionale
  seats: number,
  unitPriceCents: number,            // prezzo effettivo al momento dell'ordine (scontato se attivo)
  totalCents: number,                // unitPriceCents * seats (mulCentsByQty)
  status: "pending_payment" | "paid" | "expired" | "refunded" | "failed" | "cancelled",
  // Ciclo di vita ordine A PAGAMENTO:  pending_payment → paid → refunded  (oppure → expired/failed)
  // Ciclo di vita ordine GRATUITO:     nasce direttamente "paid" (= posto confermato; totalCents 0,
  //   paymentIntentId e holdExpiresAt sempre null) → eventuale "cancelled" (annullo admin, nessun
  //   rimborso da fare). "pending_payment"/"expired"/"refunded"/"failed" NON esistono per i gratuiti.
  buyer: { firstName; lastName; email; emailNormalized; phone; phoneNormalized },
  participants: Array<{ firstName: string; lastName: string }>,  // length === seats
  billing: BillingProfile | null,    // vedi sotto; SEMPRE null per eventi gratuiti (niente da fatturare)
  historyConsent: { granted: boolean; at: Timestamp | null },
  locale: "it" | "en",
  holdExpiresAt: Timestamp | null,
  paymentIntentId: string | null,
  paidAt: Timestamp | null,
  refundedAt: Timestamp | null, refundId: string | null,
  ip: string | null,
  version, createdAt, updatedAt, deletedAt
}
// Subcollection eventOrders/{id}/transactions/{id}:
// { stripeEventId, type, amountCents|null, summary: string, createdAt }  — log riconciliazione
```

`BillingProfile` (union discriminata su `type`):
```ts
| { type: "private"; firstName; lastName; taxCode;            // CF: regex standard 16 char
    address: { street; zip; city; province } }
| { type: "company"; businessName; vatNumber;                 // P.IVA: 11 cifre
    sdiCode: string | null;                                   // 7 alfanumerici
    pec: string | null;                                       // email
    taxCode: string | null; adminContactName: string | null;
    address: { street; zip; city; province } }
// refine: per company, almeno uno tra sdiCode e pec
```

**`eventSubscribers`** (doc):
```ts
{
  id, email, emailNormalized,        // unicità applicativa su emailNormalized
  status: "pending" | "active" | "unsubscribed",
  locale: "it" | "en",
  confirmToken: string,              // random 32 byte hex
  unsubscribeToken: string,
  consentAt: Timestamp,              // checkbox consenso esplicito (obbligatoria)
  confirmedAt: Timestamp | null, unsubscribedAt: Timestamp | null,
  createdAt, updatedAt
}
```

**`rateLimits`** (doc id: `${scope}:${key}:${windowStart}`):
```ts
{ count: number, expiresAt: Timestamp }
// Scope/limiti iniziali (costanti in src/server/public/rate-limit.ts):
//   checkout-ip:    5 / 10 min      checkout-email: 3 / 10 min      subscribe-ip: 5 / 60 min
// incremento in transazione; deny se count > limite. Cleanup: TTL policy Firestore su expiresAt (nota ops §E)
```

### File da creare

- `src/schemas/event.ts` — `EventFormSchema` (+refine: `priceCents === 0 || priceCents >= 50`; `discountedPriceCents` valorizzabile **solo** se `priceCents > 0` e allora `>= 50 && < priceCents`; **`priceCents === 0 → maxSeatsPerOrder` obbligatorio e `>= 1`** (messaggio: "Imposta un numero massimo di posti per ordine per gli eventi gratuiti"); participants/capacity ecc.), `EventDocSchema`, `EventStatusEnum`, `derivePublicStatus` **NO** (va in lib, vedi sotto). Ri-esportare dal barrel.
- `src/schemas/eventOrder.ts` — `EventOrderDocSchema`, `BillingProfileSchema`, `OrderStatusEnum`. Nel barrel.
- `src/schemas/eventCheckout.ts` — `IncomingCheckoutSchema` (wire snake_case, vedi M3). **Non** nel barrel.
- `src/schemas/eventSubscriber.ts` — `IncomingSubscribeSchema`, `SubscriberDocSchema`. **Non** nel barrel (`SubscriberDocSchema` può stare nel barrel se serve al CRM UI — a discrezione, coerenza col resto).
- `src/schemas/validators.ts` — aggiungere `zCodiceFiscale`, `zPartitaIva`, `zSdiCode`, regex CF: `/^[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]$/i`.
- `src/lib/events/status.ts` — **funzione pura condivisa**:
  ```ts
  type PublicEventStatus = "upcoming" | "bookable" | "sold_out" | "past" | "cancelled";
  derivePublicStatus(ev: {status, startsAt, endsAt, bookingOpensAt, bookingClosesAt,
                          capacity, seatsSold, seatsHeld}, now: Date): PublicEventStatus | null
  // null se draft (non pubblico). Ordine di valutazione:
  // cancelled → "cancelled"
  // now > (endsAt ?? startsAt) → "past"
  // bookingOpensAt && now < bookingOpensAt → "upcoming"
  // bookingClosesAt && now > bookingClosesAt → "past"   // prenotazioni chiuse manualmente → badge Concluso (§D.5)
  // capacity - seatsSold - seatsHeld <= 0 → "sold_out"
  // → "bookable"
  ```
  e `seatsAvailable(ev): number` (= `capacity - seatsSold - seatsHeld`, può essere negativo in overbooking), e `isFreeEvent(ev): boolean` (= `ev.priceCents === 0`) — **unica** discriminante di flusso gratuito/a pagamento, da usare ovunque al posto di confronti inline.
- `src/lib/events/normalize.ts` — `normalizeEmail` (trim+lowercase), `normalizePhone` (solo cifre; se inizia per `39` e length > 10, rimuovi il prefisso; se inizia per `0039`, idem).
- `src/lib/stripe.ts` — `import "server-only"`; singleton `new Stripe(process.env.STRIPE_SECRET_KEY!)` con `apiVersion` pinnata a quella corrente dell'SDK installato.
- `src/server/public/rate-limit.ts` — `import "server-only"`; `checkRateLimit(scope, key, limit, windowMs): Promise<boolean>` transazionale su `rateLimits`.

### Rules & indici

`firestore.rules`: aggiungere `events`, `eventOrders` (+ subcoll `transactions`), `eventSubscribers`, `rateLimits` — tutti `allow read, write: if isAdmin();` (le API pubbliche passano dall'Admin SDK).

`firestore.indexes.json`, nuovi composite:
- `events`: `(deletedAt ASC, startsAt ASC)`, `(deletedAt ASC, status ASC, startsAt ASC)`
- `eventOrders`: `(eventId ASC, createdAt DESC)`, `(eventId ASC, status ASC)`, `(status ASC, holdExpiresAt ASC)`, `(buyer.emailNormalized ASC, status ASC)`, `(eventId ASC, buyer.emailNormalized ASC, status ASC)` — quest'ultimo serve alla query di resume dell'hold in M3 (ramo a pagamento: trova l'ordine `pending_payment` esistente per stessa email+evento)
- `eventSubscribers`: `(status ASC, createdAt DESC)`

### Test (vitest, CRM)
- `event.test.ts`: validazione schema (sconto ≥ prezzo rifiutato, priceCents tra 1 e 49 rifiutato, **priceCents 0 accettato**, **priceCents 0 + sconto valorizzato rifiutato**, **priceCents 0 + `maxSeatsPerOrder` null/assente rifiutato**, **priceCents 0 + `maxSeatsPerOrder` valorizzato accettato**, capacity 0 rifiutata, recurrence valida).
- `validators.test.ts`: CF validi/invalidi, P.IVA, SDI; `BillingProfileSchema` company senza SDI né PEC → rifiutato.
- `status.test.ts`: `derivePublicStatus` — tutte le transizioni (draft→null, upcoming, bookable, sold_out con hold, past, cancelled, bookingClosesAt passato, overbooking → sold_out); `isFreeEvent` (0 → true, 50 → false).
- `normalize.test.ts`: telefoni `+39 333 1234567` / `3331234567` / `0039...` → stesso normalizzato.

### Criteri di accettazione
- [ ] `npm run check` verde; schemi nel barrel dove previsto; nessun import di `firebase-admin` senza `import "server-only"`.
- [ ] Rules + indici aggiornati e deployabili (`firebase deploy --only firestore` non fallisce in dry-run).
- [ ] Tutte le funzioni pure sopra hanno test che passano.

---

## M1 — CRM admin: CRUD eventi + UI gestione

**Repo:** `vinifera-crm` · **Dipendenze:** M0

### Server Actions — `src/server/actions/events.ts`
Speculari a `services.ts` (stesso stile: `COL = "events"`, `toEventDoc`, OCC, slug unico, upload immagini su Storage `events/{id}/{slot}.{ext}`):
- `getEvents({includeArchived})`, `getEvent(id)`
- `createEvent(raw)` — sempre `status: "draft"`, contatori a 0.
- `updateEvent(id, raw, expectedVersion)` — transazione OCC. **Se la nuova `capacity < seatsSold + seatsHeld`**: salvare comunque, ma (a) ritornare `warning: "overbooked"` con l'eccedenza, (b) after-commit: notifica admin Telegram/email via `settings/notifications` (pattern `notifyNewLead`). Le nuove prenotazioni si bloccano da sole (`seatsAvailable <= 0`).
- `publishEvent(id)` / `unpublishEvent(id)` — `status: published|draft`. Se al momento del publish l'evento risulta subito `bookable` e `subscribersNotifiedAt == null` → trigger notifica mailing list (implementata in M7; qui lasciare hook/`TODO M7` chiaramente marcato).
- `cancelEvent(id)` — solo transizione stato + `cancelledAt` (i rimborsi automatici sono M6; qui bloccare la cancellazione se esistono ordini `paid` con messaggio "implementato in M6" oppure — se M6 già fatto — delegare).
- `archiveEvent` / `restoreEvent` (soft delete).
- Refactor: estrarre `triggerSiteRevalidation(tag: "services" | "events")` in `src/server/site-revalidation.ts`; `services.ts` la importa da lì; ogni mutazione evento che tocca il catalogo pubblico chiama `triggerSiteRevalidation("events")`.

### UI — `src/app/(app)/events/`
- Aggiungere `"/events"` a `PROTECTED_PATHS` in `src/middleware.ts` e voce "Eventi" nella Sidebar (icona lucide, es. `CalendarDays`).
- `/events` — tabella (pattern tabelle esistente: sticky header, `h-14`, filtri in URL via `nuqs`, card list su mobile): titolo IT, data, badge stato, `venduti/capienza` (+held), incasso. Filtro stato + ricerca. Bottone "Nuovo evento".
- `/events/new` e `/events/[id]` — form completo (React Hook Form + Zod, campi bilingue IT/EN riusando i pattern del form servizi, upload immagini con gli stessi slot). Prezzi: input in euro convertiti con `toCents` al submit, mai float in stato. **Evento gratuito**: switch "Evento gratuito" che setta `priceCents: 0` e disabilita/azzera i campi prezzo e sconto (lo Zod refine di M0 fa da rete di sicurezza). **Attivando lo switch, il campo "Posti massimi per ordine" (`maxSeatsPerOrder`) diventa obbligatorio**: si trasforma da opzionale a required nel form (asterisco + validazione RHF bloccante al submit), con testo di spiegazione inline sotto il campo ("Per gli eventi gratuiti è obbligatorio impostare un limite di posti per ordine, a tutela da prenotazioni eccessive") — non un dialog separato, la stessa vista del form. Se l'utente disattiva di nuovo lo switch, il campo torna facoltativo (valore già inserito resta, non viene azzerato). Nella lista e nel dettaglio il prezzo si mostra come "Gratuito" invece di `formatEUR(0)`.
- Dettaglio evento con **rail sinistra a sub-route** (no tab, §17): `/events/[id]` (dettagli+form), `/events/[id]/orders` (M8), `/events/[id]/stats` (M8). In testata: badge stato pubblico derivato + azioni Pubblica/Nascondi/Cancella (Dialog di conferma solo per Cancella) + alert arancione se overbooked.
- **Badge stato CRM** (convenzione colori CRM, NON la palette sito): `draft`→outline grigio, `upcoming`→grigio (pending), `bookable`→blu (in_progress), `sold_out`→ambra (overdue), `past`→verde (completed), `cancelled`→rosso scuro.
- Hook di lettura client `src/hooks/useEvents.ts` (client SDK + React Query, come gli altri hook).

### Test
- Unit su eventuali helper estratti (es. calcolo eccedenza overbooking). Le action restano non testate come le altre (coerenza repo).

### Criteri di accettazione
- [ ] Creo/edito/pubblico/nascondo/archivio un evento da UI; slug duplicato rifiutato; OCC funziona (due sessioni → conflitto).
- [ ] Attivando "Evento gratuito" senza valorizzare "Posti massimi per ordine" il submit è bloccato con errore inline sul campo; disattivando lo switch il campo torna facoltativo.
- [ ] Riduzione capienza sotto il venduto: salva, mostra alert, notifica Telegram/email inviata.
- [ ] Ogni publish/update di evento pubblicato spara la revalidation col tag `events` (visibile nei log).
- [ ] `npm run check` verde.

---

## M2 — Catalogo pubblico eventi: API CRM + sezione sito

**Repo:** entrambi (prima CRM, poi sito) · **Dipendenze:** M0, M1 · **Deps sito:** `vitest` (dev)

### CRM — endpoint pubblici
- `src/server/public/events.ts` + `src/app/api/public/events/route.ts`:
  `GET /api/public/events` — auth `verifyApiKey()`. Ritorna eventi `deletedAt == null && status != "draft"` **esclusi i `cancelled`** (decisione: i cancellati spariscono dal sito). Include i passati (il sito li mostra come "Concluso"). DTO (camelCase come services):
  ```ts
  { id, slug, title: {it,en}, summary: {it,en}, description: {it,en},
    imageUrl, images, location: {name,address,city},
    startsAt: string /*ISO*/, endsAt: string|null,
    bookingOpensAt: string|null, bookingClosesAt: string|null,
    priceCents, discountedPriceCents, featured, maxSeatsPerOrder,
    publicStatus: "upcoming"|"bookable"|"sold_out"|"past",   // derivato al momento della risposta
    seatsAvailable: number }                                  // clamp a >= 0 nel DTO pubblico
  ```
  Header cache come services: `s-maxage=3600, stale-while-revalidate=600`.
- `GET /api/public/events/[id]/availability` — auth bearer, **no-store**: `{ publicStatus, seatsAvailable, maxSeatsPerOrder, priceCents, discountedPriceCents, isFree, holdTtlMinutes }` (`isFree` derivato da `isFreeEvent`; `holdTtlMinutes` non significativo se `isFree`). Usata dalla pagina di prenotazione (mai fidarsi della cache — punto CRITICO del brainstorming) **e per decidere il ramo del flusso di checkout (gratuito vs pagamento, M3)**.

### Sito — data layer e pagine
- `src/lib/events.ts` — pattern identico a `services.ts`: `fetchEventsFromCRM()` con `next: { revalidate: 300, tags: ["events"] }`, mock in dev, `[]` in prod se env mancanti; `getAllEvents`, `getFeaturedBookableEvents` (featured && bookable — auto-rimozione dal banner garantita), `getEventBySlug`, `localiseEvent(s)`; `fetchEventAvailability(id)` con `cache: "no-store"` (server-only).
- Rotte:
  - `/[locale]/eventi` — lista: sezione eventi futuri (card con badge) + sezione "Eventi passati" (badge Concluso). Bottone "Tienimi aggiornato" (UI in M7, qui placeholder o direttamente M7 se si accorpa).
  - `/[locale]/eventi/[slug]` — dettaglio: hero, descrizione, data/luogo, prezzo (barrato se sconto, riuso convenzioni servizi; se `priceCents === 0` → etichetta "Gratuito"/"Free" da dizionario, mai "0,00 €"), badge, CTA "Prenota" visibile solo se `bookable` (verifica live con `fetchEventAvailability` nel server component, `dynamic = "force-dynamic"` o fetch no-store).
- **Badge stato (palette sito, decisione prodotto)** — mappare sui token esistenti di `globals.css`, nessun colore nuovo:
  | publicStatus | Badge IT | Sfondo | Testo |
  |---|---|---|---|
  | `upcoming` | Prossimamente | `--accent` (oro) | `--primary` (verde) |
  | `bookable` | Prenotazioni aperte | `--primary` (verde) | `--accent` (oro) |
  | `sold_out` | Posti terminati | `--destructive` (rosso vino) | bianco |
  | `past` | Concluso | `--muted` (grigio) | `--foreground`/bianco secondo contrasto |
- **Banner home "in evidenza"**: componente client in `[locale]/page.tsx`, slide-in dall'alto (framer-motion, 150–300ms, no bounce, `prefers-reduced-motion`), non bloccante, dismissibile (X), ricompare una volta per sessione (`sessionStorage`). Contenuto: primo evento `featured && bookable` (titolo, data, CTA alla pagina evento). Se nessun evento eligible → non renderizza nulla. Dettagli grafici fini: proposta iniziale libera, verrà rivista (§D.6).
- i18n: sezione `events` in `it.json`/`en.json` (badge, labels, CTA, banner, sezioni). Voce "Eventi" nel nav (`nav.events`) e nel footer se elenca le sezioni.
- SEO: metadata + hreflang su entrambe le rotte; JSON-LD `Event` sulla pagina dettaglio (`name`, `startDate`, `endDate?`, `location` Place, `offers` {price = prezzo effettivo in euro decimali, `0` per i gratuiti (`isAccessibleForFree: true` in quel caso), priceCurrency EUR, availability InStock/SoldOut, url}, `eventStatus: EventScheduled`, `organizer` = riuso dati `ProfessionalService`); `sitemap.ts` diventa async e aggiunge `/eventi` + un URL per evento non-past.
- **Init Vitest nel repo sito** (non esiste ancora): dev-dep `vitest`, script `"test": "vitest run"`, config minimale node env. Primi test: mapping `publicStatus → badge`, `localiseEvent` fallback it.

### Criteri di accettazione
- [ ] `GET /api/public/events` risponde 401 senza bearer, 200 col bearer; DTO conforme; cancellati e draft assenti.
- [ ] Sito: lista e dettaglio renderizzano in it/en da mock (dev) e da CRM (env configurate); badge conformi alla tabella; CTA Prenota assente se non bookable; evento gratuito mostra "Gratuito"/"Free" (mai "0,00 €") in card, dettaglio e JSON-LD (`price: 0` + `isAccessibleForFree`).
- [ ] Modifica evento nel CRM → pagina sito aggiornata in pochi secondi (push revalidate) o comunque entro 5 min.
- [ ] Banner home: appare solo con evento featured+bookable, dismiss persiste nella sessione.
- [ ] Sitemap include le rotte eventi; JSON-LD valida (Rich Results Test manuale, nota in PR).
- [ ] `npm test` (sito) e `npm run check` (CRM) verdi.

---

## M3 — Checkout: hold posti + PaymentIntent + pagina pagamento sito

**Repo:** entrambi · **Dipendenze:** M0, M2 · **Deps sito:** `@stripe/stripe-js`, `@stripe/react-stripe-js`

### Contratto — `POST /api/public/events/checkout` (CRM, sync, NON fire-and-forget)
Auth `verifyApiKey()`. Body (snake_case, validato da `IncomingCheckoutSchema`):
```jsonc
{
  "event_id": "…", "seats": 2, "locale": "it",
  "buyer": { "first_name": "…", "last_name": "…", "email": "…", "phone": "…" },
  "participants": [ { "first_name": "…", "last_name": "…" }, … ],   // length === seats
  "billing": { "type": "private", "first_name": "…", "last_name": "…", "tax_code": "…",
               "address": { "street": "…", "zip": "…", "city": "…", "province": "…" } },
               // oppure type "company": business_name, vat_number, sdi_code?, pec?, tax_code?, admin_contact_name?, address
               // OPZIONALE nello schema wire: OBBLIGATORIO se l'evento è a pagamento (400 se assente),
               // VIETATO se l'evento è gratuito (400 se presente) — enforcement nell'endpoint, che conosce l'evento
  "history_consent": true,
  "website": ""                       // honeypot: se valorizzato → 200 fake { ok: true }
}
```
Risposte:
- Evento a pagamento: `200 { mode: "payment", order_id, client_secret, hold_expires_at, total_cents, publishable_hint: "resume"|null }`
- Evento gratuito: `200 { mode: "free_confirmed", order_id, order_number, total_cents: 0 }` — prenotazione **già confermata**, nessun client_secret/hold
- `409 { error: "not_enough_seats", seats_available }` · `410 { error: "not_bookable", public_status }` · `429` rate limit · `400` validazione (incluso billing mancante/indebito, `seats > maxSeatsPerOrder`).

Pseudo-logica:
```
ip = x-forwarded-for
if (!checkRateLimit("checkout-ip", ip, 5, 10min) || !checkRateLimit("checkout-email", emailNorm, 3, 10min)) → 429
ev = get(events/{id})   // pre-read fuori tx per validare billing e scegliere il ramo; ri-validato in tx

── RAMO GRATUITO (isFreeEvent(ev)) ─────────────────────────────────────
billing presente → 400
// maxSeatsPerOrder è garantito non-null per costruzione (obbligatorio a schema, M0/M1):
// unica difesa anti-abuso di questo ramo, nessun dedup né cap cross-ordine (decisione cliente, §D.10)
seats > maxSeatsPerOrder → 400
tx {
  ri-leggi ev; derivePublicStatus !== "bookable" → 410; seatsAvailable < seats → 409
  orderNumber da counters/eventOrders-{year}
  create eventOrders doc: status "paid" DIRETTO, paidAt = now, totalCents 0, unitPriceCents 0,
    billing null, holdExpiresAt null, paymentIntentId null
  update ev: seatsSold += seats          // NIENTE seatsHeld: nessun lock temporaneo
}
after-commit: sendOrderConfirmationEmail(order) + triggerSiteRevalidation("events")
  // stessi side-effect del webhook M4, MA senza ricevuta Stripe: l'email Resend è l'unica conferma
→ 200 { mode: "free_confirmed", … }

── RAMO A PAGAMENTO (priceCents > 0) ───────────────────────────────────
billing assente → 400
resume: ordine esistente pending_payment stesso emailNorm+eventId e holdExpiresAt > now+60s
  → stripe.paymentIntents.retrieve → 200 con client_secret esistente (nessun nuovo hold)
tx {
  ri-leggi ev; derivePublicStatus(ev, now) !== "bookable" → 410
  maxSeatsPerOrder != null && seats > maxSeatsPerOrder → 400
  seatsAvailable(ev) < seats → 409
  orderNumber da counters/eventOrders-{year} (increment in tx)
  create eventOrders doc: status "pending_payment", holdExpiresAt = now + 15min, snapshot, cents via mulCentsByQty
  update ev: seatsHeld += seats
}
pi = stripe.paymentIntents.create({ amount: totalCents, currency: "eur",
      receipt_email: buyer.email, description: `${titleIt} × ${seats} — ${orderNumber}`,
      metadata: { orderId, eventId, seats }, automatic_payment_methods: { enabled: true } })
  // in caso di errore Stripe → tx compensativa: order.status = "failed", seatsHeld -= seats → 502
update order { paymentIntentId }
→ 200 { mode: "payment", … }
```
Implementazione in `src/server/public/checkout.ts` + route `src/app/api/public/events/checkout/route.ts`. La logica decisionale pura (scelta ramo, validazioni disponibilità/billing, calcolo importi, decisione resume, cap `maxSeatsPerOrder`) va estratta in funzioni testabili senza Firestore/Stripe.

**`sendOrderConfirmationEmail(order)`** nasce in questo modulo in `src/server/events-emails.ts` (server-only): email Resend nella lingua dell'ordine con recap evento/posti/partecipanti/numero ordine/totale (o "Gratuito" se `totalCents === 0`, senza menzione di pagamento/ricevuta). Qui la usa il ramo gratuito; **M4 la riusa identica** per gli ordini pagati — un solo template, niente duplicazioni.

### Sito — flusso di prenotazione
- Route proxy sito: `src/app/api/events/checkout/route.ts` — rate-limit in-memory (riuso pattern leads), validazione Zod locale (stesso wire schema), honeypot, poi **forward sincrono** al CRM e ritorno della risposta com'è (status incluso). Aggiunge nulla di suo: niente segreti nel client.
- `/[locale]/eventi/[slug]/prenota` — pagina client multi-step (RHF + Zod, dep già presenti). Il ramo è deciso da `isFree` dell'availability live caricata all'ingresso:
  1. Quantità posti (rispetta `maxSeatsPerOrder` e `seatsAvailable` da availability live).
  2. Acquirente (email+telefono obbligatori) + partecipanti (nome/cognome × seats) + checkbox `history_consent` (facoltativa, testo che spiega il riconoscimento su ordini futuri) + link privacy.
  3. **Solo eventi a pagamento** — Profilo fatturazione: switch Privato/Azienda con campi condizionali (§ brainstorming). Per gli eventi gratuiti questo step **non esiste** (né nascosto né disabilitato: proprio non renderizzato, e `billing` non viene inviato).
  4. Submit → chiama il proxy →
     - **gratuito**: risposta `free_confirmed` → redirect diretto a `/{locale}/eventi/{slug}/esito?order_id=…` (nessun Payment Element, nessun countdown);
     - **a pagamento**: riceve `client_secret` + `hold_expires_at` → step pagamento: **Payment Element** (`Elements` con `clientSecret`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) + **countdown mm:ss visibile e persistente** calcolato da `hold_expires_at` (server-time driven, non timer locale cieco).
  5. Solo a pagamento: `confirmPayment` con `return_url = /{locale}/eventi/{slug}/esito?order_id=…`.
- **Scadenza countdown → schermata dedicata** (decisione prodotto): spiega che i 15 minuti sono scaduti e il posto è stato rilasciato, CTA "Ricomincia" alla pagina evento. Stesso esito se `confirmPayment` fallisce per PaymentIntent cancellato.
- `409/410/429` dal checkout → messaggi dedicati (posti insufficienti con disponibilità aggiornata / evento non più prenotabile / troppe richieste).
- `/[locale]/eventi/[slug]/esito` — legge lo stato: polling breve (~20s, backoff) su un route proxy sito → CRM `GET /api/public/events/orders/{order_id}` (bearer; ritorna solo `{ status, event_title, seats, order_number, total_cents }`; l'orderId Firestore random funge da capability token). `paid` → conferma con recap; per gli ordini a pagamento il copy cita "email di conferma e ricevuta Stripe", per i gratuiti (`total_cents === 0`) solo "email di conferma" — nessuna ricevuta Stripe esiste. Ordine gratuito arriva già `paid`, quindi il polling termina alla prima risposta. Ancora `pending_payment` dopo il polling → "pagamento in elaborazione, riceverai email"; `expired/failed` → schermata scadenza.
- PostHog (post-consenso, convenzioni sito): `event_checkout_started`, `event_checkout_completed`, `event_checkout_expired`.
- i18n: tutte le stringhe del flusso in `events.checkout.*` nei due dizionari (messaggi Zod lato sito in italiano/inglese da dizionario).

### Test
- CRM: unit su logica pura checkout (scelta ramo gratuito/pagamento; posti insufficienti; max per ordine (**incluso il ramo gratuito**: `seats > maxSeatsPerOrder → 400`); resume; **billing obbligatorio se a pagamento / vietato se gratuito**; importi con sconto; honeypot; mismatch participants/seats). Rate-limit: unit sul calcolo finestra (con clock iniettato).
- Sito: unit sullo schema Zod checkout (union billing opzionale, participants length, ramo senza billing) e sul calcolo countdown (formattazione, soglia scadenza).

### Criteri di accettazione
- [ ] Due checkout concorrenti sull'ultimo posto: uno ottiene l'hold (o la conferma, se gratuito), l'altro riceve 409 (dimostrabile con richieste parallele in dev/emulatore) — verificare **entrambi i rami**.
- [ ] A pagamento — hold visibile: `seatsHeld` incrementato, countdown visibile in pagina, resume funziona (refresh pagina → stesso ordine, niente doppio hold).
- [ ] Gratuito — prenotazione confermata immediatamente: ordine `paid` con `totalCents 0`, `billing null`, `paymentIntentId null`; `seatsSold` incrementato e `seatsHeld` MAI toccato; nessuna chiamata Stripe (verificabile: nessun PaymentIntent in dashboard test); email conferma inviata; step fatturazione e Payment Element mai renderizzati; richiesta con `seats > maxSeatsPerOrder` → 400 (unica difesa specifica del ramo, nessun dedup previsto: un doppio submit crea due ordini distinti, accettato per decisione cliente — vedi §D.10).
- [ ] Honeypot e rate limit attivi su entrambi i lati e su entrambi i rami; nessun segreto Stripe nel bundle client (solo publishable key).
- [ ] Pagamento test-mode va a buon fine fino alla pagina esito (lo stato `paid` arriva con M4; per M3 accettabile esito "in elaborazione"). L'esito del gratuito è invece completo già in M3 (nessuna dipendenza da M4).
- [ ] Check di entrambi i repo verdi.

---

## M4 — Webhook Stripe + conferma ordine + email

**Repo:** `vinifera-crm` · **Dipendenze:** M3

### `POST /api/stripe/webhook` — `src/app/api/stripe/webhook/route.ts`
- `runtime = "nodejs"`, body raw via `await req.text()`, verifica firma `stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET)` → 400 se invalida. Rispondere 200 rapidamente; lavoro in handler idempotenti.
- **Gli ordini gratuiti non transitano MAI da qui** (nessun PaymentIntent esiste): nascono `paid` direttamente nel checkout (M3) e l'eventuale annullo è gestito da M6 senza Stripe. Guardia difensiva: se un handler riceve un `orderId` il cui ordine ha `paymentIntentId === null`, loggare e uscire senza toccare nulla (non dovrebbe accadere).
- Eventi gestiti (altri: 200 e ignora):
  - **`payment_intent.succeeded`** → `orderId` da metadata. Transazione:
    - ordine `paid` → no-op (idempotenza; la doppia consegna Stripe è la norma).
    - `pending_payment` → `status: "paid"`, `paidAt`; evento: `seatsHeld -= seats`, `seatsSold += seats`.
    - `expired` (pagato oltre il grace): se `seatsAvailable >= seats` → recupera: `paid` + `seatsSold += seats`; altrimenti lascia `expired`, after-commit: `stripe.refunds.create({payment_intent})` automatico + email all'acquirente ("evento nel frattempo esaurito, rimborso totale in corso").
    - After-commit (pattern `withAfterCommit`): log su `transactions`, **email conferma via `sendOrderConfirmationEmail` (helper condiviso creato in M3, `src/server/events-emails.ts`** — stesso template del ramo gratuito; layout `buildEmailHtml` di `src/lib/email.ts`, lingua `order.locale`), `triggerSiteRevalidation("events")` (badge sold-out aggiornato), opzionale notifica admin Telegram "nuovo ordine pagato" (riuso `settings/notifications`).
  - **`payment_intent.payment_failed`** → solo log su `transactions` (l'ordine resta in hold: l'utente può ritentare finché il countdown corre).
  - **`payment_intent.canceled`** → se ordine `pending_payment`: `status: "failed"` + rilascio `seatsHeld` (caso cancel manuale da dashboard; la scadenza standard passa da M5 che cancella e aggiorna lei stessa — l'handler deve restare idempotente se lo stato è già `expired`).
  - **`charge.refunded`** → ordine `paid` → `status: "refunded"`, `refundedAt`, `refundId`; evento `seatsSold -= seats`; log; `triggerSiteRevalidation("events")`. (Le email di rimborso le manda chi avvia il rimborso in M6; qui solo riconciliazione — se refund avviato da dashboard Stripe direttamente, inviare comunque email standard di rimborso all'acquirente.)
- Ogni handler estratto come funzione pura `decideXxx(order, event, now) → { orderPatch, eventPatch, sideEffects[] }` testabile senza Stripe/Firestore; la route fa solo I/O.

### Test
- Unit sulle funzioni `decide*`: succeeded su pending/paid/expired-con-posti/expired-senza-posti; canceled su pending/expired; refunded su paid/refunded (idempotenza). Verifica firma: test che body manomesso → 400 (mock di `constructEvent` che lancia).

### Criteri di accettazione
- [ ] Con `stripe listen --forward-to localhost:3000/api/stripe/webhook`: pagamento test → ordine `paid`, contatori giusti, email conferma inviata (o loggata), revalidation sparata.
- [ ] Rigiocare lo stesso evento webhook due volte → nessun doppio incremento (idempotente).
- [ ] Firma invalida → 400. `npm run check` verde.

---

## M5 — Scheduler `checkEvents` (Cloud Function): scadenza hold, transizioni, ricorrenza

**Repo:** `vinifera-crm`, cartella `functions/` (deployable separato!) · **Dipendenze:** M3, M4 · **Deps:** `stripe` in `functions/package.json`

Nuova `export const checkEvents = onSchedule({ schedule: "* * * * *", timeZone: "Europe/Rome", region: "europe-west1", secrets: [...] }, …)` in `functions/src/index.ts` (o file separato importato da index). Secrets/params della function (indipendenti da Vercel — ripetere la nota del CLAUDE.md): esistenti `RESEND_API_KEY`, `RESEND_FROM_EMAIL` + **nuovi** `STRIPE_SECRET_KEY`, `CRM_API_KEY` (secret) e `SITE_URL` (param non segreto).

1. **Rilascio hold scaduti** (sede decisa nel brainstorming):
   ```
   orders where status == "pending_payment" && holdExpiresAt <= now - 90s   // grace
   per ciascuno:
     try stripe.paymentIntents.cancel(pi)      // se già succeeded → skip: il webhook M4 riconcilia
     tx { order.status = "expired"; event.seatsHeld -= seats }
   se almeno un rilascio → POST {SITE_URL}/api/revalidate {tag:"events"} bearer CRM_API_KEY (fire-and-forget)
   ```
2. **Apertura prenotazioni** (`upcoming → bookable` al passare di `bookingOpensAt`): stato derivato, nessuna scrittura necessaria per la correttezza — ma qui va (a) la revalidation push (badge aggiornato all'istante) e (b) il **trigger mailing list** (M7): eventi `published`, `bookingOpensAt <= now`, `subscribersNotifiedAt == null`, derivato `bookable` → invia notifiche e setta `subscribersNotifiedAt` (transazione di guardia prima dell'invio, per evitare double-send tra invocazioni). Se M7 non ancora implementato: lasciare la sola revalidation + guardia con `TODO M7`.
3. **Evento concluso + ricorrenza**: eventi `published` con `startsAt < now`, `recurrence != null`, `recurrenceProcessedAt == null` → riuso concettuale di `computeNextDue` (adattato: `computeNextOccurrence(startsAt, rule, interval)`); se `until` non superato: crea nuova istanza **`draft`** (copia contenuti; date shiftate dello stesso delta per bookingOpensAt/ClosesAt se valorizzate; contatori 0; `subscribersNotifiedAt: null`; `recurrenceParentId`; slug = `slug-base-YYYY-MM-DD`), notifica admin Telegram/email ("creato in bozza, da pubblicare"), setta `recurrenceProcessedAt` sull'istanza conclusa.

**Eventi gratuiti: nessun impatto su questo modulo.** I loro ordini non sono mai `pending_payment` (nascono `paid`, M3), quindi la query di rilascio hold del punto 1 non li seleziona per costruzione; non c'è nessun PaymentIntent da cancellare. I punti 2 e 3 sono indifferenti al prezzo (la ricorrenza copia `priceCents` com'è, 0 incluso). Non aggiungere logica ad hoc qui.

Indici: già coperti da M0 (`status+holdExpiresAt`); aggiungere qui eventuali indici emersi (es. `status+bookingOpensAt+subscribersNotifiedAt` se la query li richiede — verificare col planner, aggiornare `firestore.indexes.json`).

### Test / verifica
- La suite CI non copre `functions/` (nota CLAUDE.md): estrarre la pura `computeNextOccurrence` e le decisioni di scadenza in funzioni senza I/O dentro `functions/src`, e verificarle manualmente con emulatore (`npm run emulators`) — documentare nel PR la verifica manuale: hold scaduto rilasciato, PI cancellato, ricorrenza creata in draft.

### Criteri di accettazione
- [ ] `npm --prefix functions run build` verde; deploy con `firebase deploy --only functions` documentato nel PR (non eseguito da CI).
- [ ] Con emulatore/ambiente di prova: hold oltre TTL+grace → ordine `expired`, `seatsHeld` decrementato, PaymentIntent cancellato; pagamento arrivato al minuto 15:30 → gestito dal ramo expired del webhook (refund o recupero).
- [ ] Evento ricorrente concluso → nuova istanza in `draft` con date corrette, admin notificato, nessun duplicato alla invocazione successiva.

---

## M6 — Rimborsi e comunicazioni: cancellazione evento, rimborso manuale, "Notifica tutti"

**Repo:** `vinifera-crm` · **Dipendenze:** M4 (webhook `charge.refunded`), M1

### Server Actions (in `src/server/actions/events.ts` o `eventOrders.ts`)
- `cancelEventWithRefunds(id)` — sostituisce/completa `cancelEvent` di M1. Il ramo per ordine dipende da `order.paymentIntentId` (null = gratuito):
  1. tx: `status: "cancelled"`, `cancelledAt`.
  2. `triggerSiteRevalidation("events")` (sparisce dal sito e dal banner).
  3. Per ogni ordine `paid` **a pagamento**: `stripe.refunds.create({ payment_intent })` (**rimborso pieno**, fee assorbita — decisione prodotto); errori raccolti e riportati (non bloccano gli altri); la riconciliazione stato arriva dal webhook `charge.refunded`.
  4. Per ogni ordine `paid` **gratuito**: nessuna chiamata Stripe — tx diretta: `status: "cancelled"`, evento `seatsSold -= seats` (il webhook non arriverà mai per questi ordini, la contabilità posti si chiude qui).
  5. Email a ogni acquirente (Resend, lingua ordine): evento cancellato; il copy cita il rimborso totale in arrivo **solo** per gli ordini a pagamento — variante senza rimborso per i gratuiti.
  6. Ordini `pending_payment` (solo a pagamento, per costruzione): cancellare PaymentIntent e marcare `expired` (nessuna email).
  7. UI: Dialog di conferma critico con conteggio ordini e importo totale da rimborsare (i gratuiti contano negli ordini, non nell'importo).
- `refundOrder(orderId)` — rimborso **manuale, pieno, per singolo ordine** (bottone nel dettaglio ordine, Dialog di conferma; casistica overbooking uno-per-uno e richieste ad hoc). Stripe refund + email acquirente; stato via webhook. Errore visibile se PI non rimborsabile.
- `cancelFreeOrder(orderId)` — equivalente del rimborso per gli ordini gratuiti (stesso punto UI, label "Annulla prenotazione"): tx `status: "cancelled"` + `seatsSold -= seats`, email di annullo all'acquirente, `triggerSiteRevalidation("events")` (i posti tornano disponibili). L'UI mostra "Rimborsa" o "Annulla prenotazione" a seconda di `paymentIntentId`.
- `notifyAllBuyers(eventId, subject, body)` — bottone "Notifica tutti" nella scheda evento: oggetto e testo liberi (textarea, contenuto a discrezione di Vinifera), invio via Resend a ogni **acquirente** con ordine `paid` (dedup su emailNormalized; i partecipanti non hanno contatti — decisione prodotto). Guardia anti-doppio-invio: conferma con anteprima destinatari + log dell'invio (campo `lastBulkNotifyAt` o subcollection `notifications` sull'evento con oggetto/data/conteggio).

### Test
- Unit: selezione ordini rimborsabili, dedup destinatari "Notifica tutti", composizione lista rimborsi (paid a pagamento → refund Stripe, **paid gratuito → cancel diretto senza Stripe**, pending → cancel PI, refunded/cancelled skip), scelta variante email (con/senza menzione rimborso).

### Criteri di accettazione
- [ ] Cancellazione evento test misto (ordini a pagamento + gratuiti): i pagati → refund Stripe creati e `refunded` dopo webhook; i gratuiti → `cancelled` subito, `seatsSold` decrementato in action (senza webhook), **nessuna chiamata Stripe per loro**; email corrette per entrambe le varianti; evento sparito dal sito.
- [ ] Rimborso manuale singolo funziona e aggiorna contatori (`seatsSold -= seats` via webhook M4); "Annulla prenotazione" su ordine gratuito libera i posti immediatamente e la CTA mostrata è quella giusta in base a `paymentIntentId`.
- [ ] "Notifica tutti" invia una sola email per acquirente (ordini gratuiti inclusi: sono `paid`) e registra il log. `npm run check` verde.

---

## M7 — Mailing list "Tienimi aggiornato" (double opt-in)

**Repo:** entrambi · **Dipendenze:** M0 (schema), M5 (trigger scheduler), M1 (trigger publish)

### CRM — endpoint pubblici (`src/server/public/subscribers.ts` + route sotto `/api/public/subscribers/`)
- `POST /api/public/subscribers` — body `{ email, locale, consent: true, website: "" }`; auth bearer; rate-limit `subscribe-ip` 5/h; honeypot. Logica: `consent !== true` → 400; esiste `active` → 200 idempotente; esiste `pending` → rigenera/reinvia conferma; esiste `unsubscribed` → riporta a `pending` e reinvia; nuovo → crea `pending` + token. Email double opt-in (Resend, lingua): link `${SITE_URL}/${locale}/eventi/conferma-iscrizione?token=…`.
- `POST /api/public/subscribers/confirm` — `{ token }` → `pending → active`, `confirmedAt`. Token sconosciuto → 404.
- `POST /api/public/subscribers/unsubscribe` — `{ token }` → `unsubscribed` (idempotente).
- **Ogni email alla lista** (conferma inclusa) ha nel footer il link di disiscrizione `${SITE_URL}/${locale}/eventi/disiscrizione?token=…` (obbligo di legge — decisione prodotto).

### Notifica "nuovo evento prenotabile" (una sola volta per evento)
- Funzione condivisa CRM `sendNewEventNotification(event)` (`src/server/events-notify.ts`, server-only): destinatari = subscribers `active`; email bilingue per `locale` iscritto con titolo/data/CTA alla pagina evento; guardia transazionale su `subscribersNotifiedAt` (set PRIMA dell'invio, dentro tx di check-and-set).
- Trigger 1 (CRM): `publishEvent` quando l'evento nasce già `bookable` (chiude il `TODO M7` di M1).
- Trigger 2 (Cloud Function `checkEvents`): apertura prenotazioni temporale (chiude il `TODO M7` di M5). Nella function l'invio è re-implementato con gli helper locali (`buildEmailHtml` della function, Resend già presente) — duplicazione accettata: deployable separato per design.
- **Mai** notificare per: sold-out, chiusura, conclusione, cancellazione (decisione prodotto).

### Sito
- Sezione "Tienimi aggiornato" nella pagina `/[locale]/eventi` (non legata al singolo evento): campo email + **checkbox consenso obbligatoria** con testo esplicito + submit → route proxy sito `src/app/api/events/subscribe/route.ts` (rate-limit in-memory, honeypot, forward **fire-and-forget** al CRM — stesso rischio-lead, decisione prodotto) → messaggio "controlla la posta per confermare".
- Pagine `/[locale]/eventi/conferma-iscrizione` e `/[locale]/eventi/disiscrizione` — server components: leggono `token` dalla query, chiamano il CRM col bearer, mostrano esito (successo/link scaduto). `robots: noindex`.
- i18n: `events.subscribe.*` nei dizionari.

### CRM — vista admin
- `/events/subscribers` (o rail sotto `/events`): tabella iscritti (email, stato, date), rimozione manuale (soft: `unsubscribed`, per richieste GDPR), **export CSV** (bottone → file generato client-side dai dati della lista; basta questo, decisione prodotto). Hook `useEventSubscribers`.

### Test
- CRM unit: transizioni stato subscriber (pending/active/unsubscribed/re-subscribe), idempotenze, consenso mancante → 400, guardia `subscribersNotifiedAt` (funzione pura di decisione).
- Sito: schema Zod subscribe.

### Criteri di accettazione
- [ ] Flusso completo: iscrizione → email conferma → click → attivo; disiscrizione dal footer funziona; re-iscrizione dopo unsubscribe funziona.
- [ ] Evento pubblicato subito prenotabile E evento con apertura differita: in entrambi i casi **una sola** email per iscritto, `subscribersNotifiedAt` valorizzato; nessuna email su sold-out/chiusura/cancellazione.
- [ ] Vista CRM: elenco, rimozione manuale, export CSV. Check verdi in entrambi i repo.

---

## M8 — CRM: ordini, storico acquirenti, dashboard entrate

**Repo:** `vinifera-crm` · **Dipendenze:** M4 (ordini reali), M1 (rail evento)

### Ordini
- `/events/[id]/orders` — tabella ordini dell'evento: numero, acquirente, posti, totale (`formatEUR`; "Gratuito" se `totalCents === 0`), stato (badge: `pending_payment`→grigio, `paid`→verde, `expired`→outline, `refunded`→rosso scuro, `cancelled`→rosso scuro, `failed`→ambra), data. Drawer/Sheet di dettaglio (no pagina nuova, §17): partecipanti, **profilo fatturazione completo** ben leggibile con bottone "Copia dati fatturazione" (testo strutturato pronto per la commercialista/EasyCloudFatt — è il deliverable chiave del profilo); **per gli ordini gratuiti (`billing === null`) l'intera sezione fatturazione non si renderizza** (niente placeholder vuoti: non c'è nulla da fatturare), così come i riferimenti Stripe. Per i pagati: riferimenti Stripe (link a dashboard PI), log `transactions`, bottone Rimborsa (M6) / per i gratuiti: bottone Annulla prenotazione (M6).
- Hook `useEventOrders(eventId)` (client SDK + React Query).

### Storico acquirenti
- `/events/buyers` — vista aggregata derivata (nessuna collection): server action `getBuyersHistory()` che legge gli ordini `paid|refunded|cancelled` (i gratuiti sono `paid` e contano nello storico — decisione cliente; `cancelled` incluso come equivalente gratuito di `refunded`) **con `historyConsent.granted == true`** e li raggruppa con funzione pura `groupOrdersByBuyer(orders)`: union-find su `emailNormalized` OR `phoneNormalized` (match se almeno uno combacia — decisione prodotto). Output per acquirente: nome più recente, email/telefoni noti, n. ordini, posti totali, speso totale, eventi frequentati, ultimo ordine. Ordini senza consenso: esclusi dal matching, visibili solo nel contesto del singolo evento.
- UI: tabella + drawer dettaglio con lista ordini della persona.

### Dashboard entrate (per Vinifera, non export formale — decisione prodotto)
- `/events/stats` + mini-recap nella rail `/events/[id]/stats`. Server action `getEventsRevenueStats({year?})`. Metriche proposte (§D.4 per conferma): per evento — lordo incassato (paid), rimborsato, **netto**, posti venduti/capienza (% riempimento), n. ordini, ticket medio/ordine; aggregato — totale netto per anno e per mese (bar chart `recharts`, già in stack), n. eventi svolti, totale partecipanti. Tutto in centesimi, formattato con `formatEUR`. **Eventi gratuiti**: entrano nei conteggi di riempimento/ordini/partecipanti e contribuiscono 0 alle entrate (nessun ramo speciale nelle somme: `totalCents 0` fa il lavoro da solo); il ticket medio dell'evento gratuito si mostra come "—"; ordini `cancelled` esclusi da posti/partecipanti come i `refunded`.

### Test
- `groupOrdersByBuyer`: match per email sola, telefono solo, transitivo (A~B via email, B~C via telefono), esclusione senza consenso, normalizzazione telefoni.
- Aggregazioni stats: somme nette con rimborsi, split per mese (funzione pura con clock/dati iniettati).

### Criteri di accettazione
- [ ] Ordini visibili per evento con dettaglio e copia dati fatturazione; per un ordine gratuito la sezione fatturazione e i riferimenti Stripe non compaiono e il totale mostra "Gratuito"; storico acquirenti raggruppa correttamente (fixture con email/telefoni incrociati, ordini gratuiti inclusi) e rispetta il consenso.
- [ ] Stats: numeri coerenti con fixture nota che include eventi gratuiti (paid − refunded; i gratuiti pesano 0 sulle entrate ma contano su ordini/partecipanti/riempimento). `npm run check` verde.

---

## E. Env & checklist operativa (fuori dal codice, da fare prima del live)

| Dove | Variabile/azione | Note |
|---|---|---|
| CRM Vercel | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | webhook endpoint da registrare in dashboard Stripe: `POST {CRM}/api/stripe/webhook`, eventi: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded` |
| Sito App Hosting | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | in `apphosting.yaml` (BUILD+RUNTIME, pubblica) |
| Functions | `firebase functions:secrets:set STRIPE_SECRET_KEY`, `CRM_API_KEY`; param `SITE_URL` | indipendenti dagli env Vercel (stessa trappola dei Resend, già nota) |
| Stripe dashboard | attivare email ricevute ("Successful payments") | le ricevute automatiche non partono in test mode |
| Firestore | TTL policy su `rateLimits.expiresAt` | `gcloud firestore fields ttls update` o console |
| Stripe | test end-to-end in test mode con `stripe listen` prima del go-live | |
| Legale | aggiornare informativa privacy del sito (nuovi trattamenti: acquirente, partecipanti, fatturazione, matching consensuale, mailing list, Stripe/Resend/commercialista) | NON è task di coding — promemoria dal brainstorming |
| Commercialista | conferma finale campi profilo fatturazione | prevista dal brainstorming |

---

## D. Punti ambigui / scelte da confermare (segnalati, non ignorati)

1. **TTL hold = 15 min** — il brainstorming lo dava come indicativo: qui confermato come costante `HOLD_TTL_MINUTES = 15` (facile da cambiare). Ok?
2. **[RISOLTO] Eventi gratuiti supportati** — richiesta cliente successiva alla prima stesura. `priceCents === 0` attiva il percorso senza Stripe: conferma immediata in transazione Firestore, niente hold/countdown, niente profilo di fatturazione. Vedi §A (riga "Eventi gratuiti") e gli impatti puntuali in M0, M1, M2, M3, M4 (esclusione esplicita), M5 (nessun impatto, motivato), M6, M8. Resta aperto il punto 10 qui sotto.
3. **Ricorrenza → istanza successiva creata in `draft`** (l'admin rivede e pubblica; niente auto-publish). Scelta conservativa non esplicitata nel brainstorming: confermare che non si voglia l'auto-pubblicazione.
4. **Metriche dashboard**: lista proposta in M8 — il brainstorming chiedeva di "scegliere le metriche giuste": confermare/potare con Vinifera.
5. **Stato interno "chiuso"** (bookingClosesAt passato ma evento futuro): mappato sul badge **Concluso** per restare sui 4 badge decisi. Alternativa: quinto badge "Prenotazioni chiuse" (grigio). Confermare.
6. **Banner home**: spec strutturale data (slide-in alto, dismiss, 1×sessione); i dettagli grafici restano da definire in fase di design UI, come da brainstorming.
7. **Consenso storico (`history_consent`)**: checkbox **facoltativa** in checkout (senza consenso l'ordine è valido ma escluso dal matching cross-ordine). Il brainstorming chiede consenso esplicito registrato ma non dice se bloccante: confermare.
8. **Eventi cancellati**: rimossi dal sito senza badge dedicato (il brainstorming lo dava come "probabile, da confermare") — qui assunto definitivo.
9. **Rimborsi solo totali per ordine** (automatici e manuali). Il rimborso parziale non è previsto in v1.
10. **[RISOLTO] Anti-abuso sugli eventi gratuiti — semplificato su richiesta cliente.** Volumi di eventi bassi: niente dedup né cap cumulativo cross-ordine. Unica difesa specifica: **`maxSeatsPerOrder` obbligatorio** per gli eventi gratuiti (schema M0, form M1, enforcement checkout M3), più le difese generiche già previste per entrambi i rami (rate limit IP/email persistente, honeypot, rate limit in-memory lato sito). Un doppio submit sullo stesso evento genera due ordini distinti (non deduplicati): accettato consapevolmente. Mass-booking con email multiple resta possibile in teoria; nessuna mitigazione ulteriore prevista salvo il problema si presenti davvero in produzione.
