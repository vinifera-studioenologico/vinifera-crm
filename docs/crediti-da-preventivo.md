# Crediti da Preventivo — documento di sviluppo

> **Obiettivo**: rendere strutturalmente impossibile far pagare due volte la stessa analisi
> allo stesso cliente, e rendere visibile lo stato di pagamento ovunque si guardi un campione.
>
> **Stato**: implementato su branch `feat/crediti-da-preventivo`, `npm run check` verde.
> Non ancora mergiato/deployato — in attesa di revisione.
> **Data**: 9 settembre 2026.

---

## 1. Contesto e problema

Il CRM registra correttamente tutti i dati, ma:

1. **Lo stato di pagamento è invisibile** fuori dalla tab Pagamenti del cliente. Le liste campioni
   e il dettaglio campione mostrano solo lo stato di lavorazione. Chi opera non ha modo di sapere,
   guardando un campione, se è già stato pagato.
2. **Un preventivo con analisi singole non lascia traccia consumabile.** Quando un preventivo viene
   approvato con generazione del pagamento (es. 3× pH), quelle 3 analisi risultano pagate ma nulla
   lo registra: alla creazione del campione fisico il wizard ripropone pH da zero e — se si attiva
   "Crea pagamento" — la stessa analisi viene fatturata due volte.

Il caso "riga pacchetto" nel preventivo è **già coperto** oggi: all'approvazione parte
`purchasePackage()` che crea un `ClientPackageDoc` con `remainingAnalyses`, consumato poi dai
campioni. Il caso "riga analisi singola" no.

**Soluzione**: generalizzare il meccanismo dei pacchetti. Una riga-analisi di un preventivo
approvato *con pagamento* genera un `ClientPackageDoc` "credito", identico a un pacchetto ma
**vincolato a una singola analisi**. Il consumo passa dallo stesso identico codice già in
produzione (`coveredByPackageId` + decremento transazionale), quindi per chi usa il wizard non
cambia nulla: vede una voce in più nella tendina "pacchetti disponibili".

---

## 2. Decisioni di prodotto (già confermate — non rimetterle in discussione)

| # | Decisione | Motivo |
|---|-----------|--------|
| 1 | I crediti si generano **solo alla transizione ad `approved`**, mai in bozza | Una bozza è modificabile e può essere rifiutata; `approved` è terminale (`ALLOWED_QUOTE_TRANSITIONS.approved === []`) quindi l'evento è one-shot per costruzione |
| 2 | **Un credito per riga**, vincolato a quella specifica analisi (`restrictedToAnalysisId`) | Righe diverse hanno `analysisId` e prezzi diversi: un pool generico permetterebbe di spendere il credito di un'analisi economica su una più cara |
| 3 | Il credito nasce **solo se nasce anche il pagamento** | Un credito senza pagamento dietro = analisi regalata |
| 4 | **Solo quantità intere** (`Number.isInteger(quantity)`) | Un conteggio di analisi da scalare non può essere frazionario. Le righe con quantità decimale restano fuori dal meccanismo, fatturate come oggi |
| 5 | Anche l'**assegnazione di pacchetti veri** da preventivo va vincolata alla creazione del pagamento | Oggi è un bug: `purchasePackage` è chiamato incondizionatamente (vedi §9.1) |
| 6 | Etichetta esplicita: `Da preventivo 2026/0034 — pH` | Chi opera deve capire da dove viene la copertura, senza confonderla con un pacchetto commerciale |
| 7 | **Nessun backfill** dello storico | I preventivi già approvati restano come sono. Per un eventuale caso singolo esiste già l'assegnazione manuale di un pacchetto dalla UI |

---

## 3. Convenzioni del progetto da rispettare (attenzione: facili da sbagliare)

- Ogni Server Action inizia con `"use server";` poi `import "server-only";` e chiama
  `requireAdmin()` come prima istruzione.
- Accesso ai campi Firestore in **bracket notation**: `data["clientId"]`, mai `data.clientId`.
- Tutti gli importi sono **interi in centesimi**. Mai aritmetica su euro decimali.
- **Le rate si scrivono con il campo `dueAt`, non `dueDate`.** Lo schema `InstallmentDocSchema`
  dichiara `dueDate` ma tutti i writer usano `dueAt`; il reader (`toInstallmentDoc`,
  `payments.ts:50-62`) accetta entrambi per compatibilità con dati legacy da `scripts/seed-dev.ts`.
  **I nuovi writer devono usare `dueAt`.**
- L'Admin SDK **rifiuta i campi `undefined`**: omettere la chiave o scrivere `null`.
- In una transazione Firestore: **tutte le letture prima di tutte le scritture**.
- Gli schemi Zod stanno in `src/schemas/`, riesportati da `index.ts`.
- Test: il progetto testa **solo funzioni pure** (`lib/calc/*`, `lib/utils/*`, `*-logic.test.ts`).
  Non esistono test che colpiscono Firestore. Quindi: estrarre la logica in funzioni pure e
  testare quelle.
- A fine lavoro: `npm run check` (typecheck + lint + test + build).

---

## 4. Modello dati

### 4.1 `ClientPackageDoc` — campi nuovi

File: `src/schemas/package.ts`

```ts
export const ClientPackageDocSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  packageId: z.string().optional(),      // ⚠️ era obbligatorio: i crediti non hanno template
  packageNameSnapshot: z.string(),
  totalAnalyses: z.number().int().min(0),
  remainingAnalyses: z.number().int().min(0),
  priceCents: zCents,
  status: ClientPackageStatusSchema,     // active | exhausted | cancelled — invariato
  paymentId: z.string().optional(),

  // ── NUOVI ──
  origin: z.enum(["purchase", "quote"]).optional(),  // assente ⇒ "purchase" (retrocompat)
  sourceQuoteId: z.string().optional(),
  sourceQuoteNumber: z.string().optional(),          // es. "2026/0034", per etichette e link
  restrictedToAnalysisId: z.string().optional(),     // assente ⇒ pacchetto generico

  purchasedAt: z.any(),
  cancelledAt: z.any().optional(),
  cancelReason: z.string().optional(),
  createdAt: z.any(),
  updatedAt: z.any(),
});
```

**Retrocompatibilità**: tutti i campi nuovi sono opzionali e assenti sui documenti esistenti.
Un pacchetto senza `restrictedToAnalysisId` resta generico e si comporta esattamente come oggi.
Branchare sempre su `origin === "quote"`, non sulla presenza di `sourceQuoteId`.

`packageId` diventa opzionale: verificato che l'unico lettore è `toClientPackageDoc`
(`clientPackages.ts:28`, già con fallback `?? ""`); nessuna UI linka al template dal
clientPackage.

### 4.2 Come si presenta un credito

```jsonc
{
  "clientId": "abc123",
  "packageNameSnapshot": "Da preventivo 2026/0034 — pH",  // etichetta pronta per la UI
  "totalAnalyses": 3,
  "remainingAnalyses": 3,
  "priceCents": 4500,                    // totale riga (unitPrice × quantity)
  "status": "active",
  "paymentId": "pay_xyz",
  "origin": "quote",
  "sourceQuoteId": "quote_789",
  "sourceQuoteNumber": "2026/0034",
  "restrictedToAnalysisId": "an_ph"
  // packageId assente
}
```

L'etichetta è **precalcolata in `packageNameSnapshot`**: il wizard e la tab pacchetti la mostrano
già così com'è, senza join né modifiche di rendering.

⚠️ `priceCents` è il **valore lordo della riga di preventivo** (`unitPriceCents × quantity`), senza
sconti né tasse del preventivo applicati: è un dato indicativo per la UI, **non** una cifra
contabile. La copertura azzera comunque il costo dell'analisi a prescindere dal prezzo del
credito, quindi non entra in nessun calcolo di denaro.

### 4.3 Firestore rules e indici — nessuna modifica

- `firestore.rules`: `match /clientPackages/{pkgId} { allow read, write: if isAdmin(); }` — la
  regola è già a livello di collection, i campi nuovi non la toccano.
- `firestore.indexes.json`: le query restano a **soli filtri di uguaglianza**
  (`clientId ==` + `status ==`, oppure `sourceQuoteId ==`), che Firestore serve senza indice
  composito. **Non aggiungere indici.** Il filtro su `restrictedToAnalysisId` si fa in memoria
  (un cliente ha pochi pacchetti attivi).

---

## 5. Regola di matching (la parte critica)

### 5.1 Ordine di consumo

Per ogni analisi da coprire:

1. **Prima** il credito ristretto a *quella* analisi (`restrictedToAnalysisId === analysisId`),
   con `remainingAnalyses > 0`, il più vecchio per primo (FIFO su `createdAt`).
2. **Poi** un pacchetto generico (`restrictedToAnalysisId` assente), sempre FIFO.
3. Altrimenti nessuna copertura → l'analisi si paga.

**Perché i crediti ristretti vanno consumati per primi**: il credito è già stato pagato
*specificamente* per quell'analisi. Se si consumasse prima il pacchetto generico, il credito
resterebbe lì inutilizzato e il cliente avrebbe di fatto pagato due volte la stessa analisi —
esattamente ciò che il progetto vuole impedire.

**Un credito ristretto non deve MAI coprire un'analisi diversa da quella per cui è nato.**
È l'invariante principale della feature.

### 5.2 Funzione pura condivisa

File: `src/lib/calc/sample.ts` (estendere quello esistente)

```ts
export interface PackageSlot {
  id: string;
  remainingAnalyses: number;
  restrictedToAnalysisId?: string | null;   // null/undefined = generico
}

/**
 * Sceglie lo slot da usare per UNA analisi, secondo l'ordine di §5.1.
 * `remainingByPkg` riflette gli slot ancora liberi tenendo conto delle
 * assegnazioni già fatte in questa stessa sessione/transazione.
 * Funzione PURA.
 */
export function pickSlotForAnalysis(
  packages: PackageSlot[],                  // già ordinati FIFO (createdAt asc)
  analysisId: string,
  remainingByPkg: Map<string, number>,
): string | null {
  const free = (p: PackageSlot) => (remainingByPkg.get(p.id) ?? 0) > 0;
  return (
    packages.find((p) => p.restrictedToAnalysisId === analysisId && free(p))?.id ??
    packages.find((p) => !p.restrictedToAnalysisId && free(p))?.id ??
    null
  );
}
```

E la firma di `assignPackageCoverage` cambia: **da `count: number` a `analysisIds: string[]`**,
perché senza sapere *quale* analisi si sta coprendo non si può applicare la restrizione.

```ts
export function assignPackageCoverage(
  packages: PackageSlot[],
  analysisIds: string[],                    // ⚠️ era `count: number`
): { coverage: (string | null)[]; decrements: Record<string, number> } {
  const remaining = new Map(packages.map((p) => [p.id, p.remainingAnalyses]));
  const decrements: Record<string, number> = {};
  const coverage: (string | null)[] = [];

  for (const analysisId of analysisIds) {
    const pkgId = pickSlotForAnalysis(packages, analysisId, remaining);
    coverage.push(pkgId);
    if (pkgId) {
      remaining.set(pkgId, (remaining.get(pkgId) ?? 0) - 1);
      decrements[pkgId] = (decrements[pkgId] ?? 0) + 1;
    }
  }
  return { coverage, decrements };
}
```

I test esistenti in `src/lib/calc/sample.test.ts` (7 casi su `assignPackageCoverage`) vanno
adeguati alla nuova firma passando array di id fittizi — il loro significato resta valido.

### 5.3 I TRE punti di consumo (nessuno può essere dimenticato)

| # | Dove | Cosa fa oggi | Cosa serve |
|---|------|--------------|------------|
| 1 | `SampleWizard.addAnalysis()` — `src/components/forms/SampleWizard.tsx:336` | Preseleziona il primo pacchetto con slot liberi, **ignorando l'analisi** | Usare `pickSlotForAnalysis` |
| 2 | `SampleWizard` tendina per riga — `SampleWizard.tsx:446` (`packagesForRow`) | Mostra tutti i pacchetti con slot liberi | Filtrare: generici **oppure** ristretti a *questa* analisi |
| 3 | `addSampleAnalyses()` — `src/server/actions/samples.ts:228` | `assignPackageCoverage(packages, toAdd.length)`, FIFO cieco | Passare gli `analysisId` degli item da aggiungere |

⚠️ **Il punto 3 è il più pericoloso**: è una Server Action che assegna la copertura in automatico
quando si aggiungono analisi a un campione già esistente dal dettaglio. Senza la modifica,
assegnerebbe silenziosamente un credito "pH" a un'analisi "Densità".

Attenzione al dettaglio in `addSampleAnalyses:220-231`: il `.map()` che costruisce l'array
`packages` estrae oggi solo `{ id, remainingAnalyses, createdAtMs }` — **va aggiunto
`restrictedToAnalysisId: dpkg.data()["restrictedToAnalysisId"] ?? null`**, altrimenti la nuova
firma riceve slot tutti "generici" e la restrizione non ha alcun effetto pur essendo implementata.

**L'override `chargeAnyway` resta invariato e intenzionale**: se l'operatore lo attiva su
un'analisi coperta da un credito, l'analisi viene addebitata e il credito **non** viene consumato
(il decremento avviene solo per item con `coveredByPackageId && !chargeAnyway`). È la via d'uscita
esplicita per i casi eccezionali.

---

## 6. Flusso A — generazione crediti all'approvazione del preventivo

### 6.1 Situazione attuale (da sostituire)

`QuoteDetailClient.handleApprove` (`src/app/(app)/quotes/[id]/_components/QuoteDetailClient.tsx:154-186`)
esegue **tre chiamate sequenziali dal client**, non transazionali:

```
transitionQuote()  →  loop purchasePackage()  →  createManualPayment()
```

Se il browser si chiude a metà, il preventivo resta `approved` (stato terminale, non ripetibile)
senza pagamento e senza pacchetti. Aggiungere un quarto passaggio in questo stile peggiorerebbe
il problema.

### 6.2 Nuova Server Action unica e transazionale

File: `src/server/actions/quotes.ts`

```ts
export async function approveQuoteWithPayment(raw: unknown): Promise<ActionResult<{ quoteId: string }>>
```

Schema di input — file `src/schemas/quote.ts` (riesportare da `index.ts`):

```ts
export const ApproveQuoteInputSchema = z.object({
  quoteId: z.string().min(1),
  expectedVersion: z.number().int().min(0),
  payment: PaymentFormSchema.nullable(),      // null = approva senza pagamento
  packageAssignments: z.array(
    z.object({
      packageId: z.string().min(1),
      packageNameSnapshot: z.string(),
      totalAnalyses: z.number().int().min(1),
      priceCents: zEurInput,
    }),
  ),
});
```

**Sequenza dentro un unico `adminDb.runTransaction`** (tutte le letture prima delle scritture):

**Letture**
1. `tx.get(quoteRef)` → esiste? `version === expectedVersion`? `isQuoteTransitionAllowed(from, "approved")`?
2. `tx.get()` di ogni template pacchetto in `packageAssignments` (verifica esistenza, come fa
   `purchasePackage:89-93`).
3. `tx.get(clientRef)` → il cliente esiste? Serve perché le scritture aggiornano
   `clients/{id}.stats` con `tx.update`, che **fallisce se il documento non esiste**: meglio un
   errore chiaro che un'eccezione di transazione.

**Scritture**

⚠️ **Regola preliminare**: se `payment === null` **oppure** `payment.totalAmountCents === 0`, si
tratta a tutti gli effetti come "approvazione senza pagamento". Un pagamento da €0 creerebbe
crediti senza contropartita — cioè analisi regalate, l'opposto della decisione 3. È anche la
convenzione già usata altrove nel codice (`purchasePackage:118`, `createSample:478` creano il
pagamento solo `if (... && importo > 0)`).

4. **Senza pagamento**: aggiorna solo lo stato del preventivo (status, version+1,
   `approvedAt`, `approvedBy`, `frozenSnapshot` — copiare la logica di `transitionQuote:321-337`),
   **nessun pacchetto, nessun credito**. → *decisioni 3 e 5*.
5. **Con pagamento**:
   - crea il `Payment` con `source: { kind: "quote", refId: quoteId, quoteNumber }` (§6.3) e le
     rate secondo il piano calcolato (§6.4), campo **`dueAt`**;
   - per ogni `packageAssignment`: crea il `ClientPackageDoc` (`origin: "purchase"`,
     `paymentId` del pagamento appena creato, `remainingAnalyses = totalAnalyses`);
   - per ogni credito derivato dalle righe-analisi (§6.5): crea il `ClientPackageDoc` con
     `origin: "quote"`, `restrictedToAnalysisId`, `sourceQuoteId`, `sourceQuoteNumber`,
     `packageNameSnapshot = "Da preventivo {number} — {nomeAnalisi}"`, `paymentId`;
   - aggiorna `clients/{id}.stats.pendingAmountCents` con l'importo residuo (come fanno le action
     esistenti);
   - aggiorna il preventivo come al punto 4.

⚠️ **L'importo del pagamento è modificabile dall'operatore nel dialog** (default `quote.totalCents`).
I crediti si derivano **sempre dalle righe del preventivo**, non dall'importo incassato: se il
laboratorio decide di applicare uno sconto a voce e abbassa il totale, le analisi restano coperte.
È il comportamento voluto — il credito dice "questa analisi è già stata addebitata", non "vale N euro".

**Note sugli import** in `src/schemas/quote.ts`: servono `zEurInput` da `./validators` (oggi il
file importa solo `zCents`) e `PaymentFormSchema` da `./payment`.

**Guardia sul limite di transazione**: Firestore ammette max 500 scritture per transazione.
Rifiutare in partenza se `crediti + pacchetti + rate + 3 > 450`, con errore
`"Preventivo troppo grande per essere approvato in un'unica operazione"`.

**Dopo la transazione**: `revalidatePath` per `/quotes`, `/quotes/{id}`,
`/clients/{clientId}/payments`, `/clients/{clientId}/packages`, `/payments`.

Il pagamento creato è un documento `payments` **ordinario**: entra da solo nella tab Pagamenti,
nel ricalcolo overdue del cron giornaliero (`/api/reminders/cron`) e nelle notifiche rate del
Cloud Function. Non serve nulla di speciale.

### 6.3 Tracciabilità: nuovo `source.kind = "quote"`

Oggi il dialog invia `source: { kind: "manual", refId: quote.id }`, ma `createManualPayment`
**scarta il `refId`** (§9.2): nessun pagamento è risalibile al preventivo che lo ha generato.
Con la nuova action conviene tracciarlo per bene, riusando lo stesso schema di `sampleCode`:

1. `src/schemas/payment.ts` — `PaymentSourceSchema`: aggiungere `"quote"` all'enum `kind` e il
   campo `quoteNumber: z.string().optional()`. È additivo: i valori esistenti restano validi.
2. `src/app/(app)/payments/_components/PaymentsClient.tsx:82-86` e
   `src/app/(app)/clients/[id]/payments/_components/ClientPaymentsClient.tsx:514-518` —
   aggiungere `quote: "Preventivo"` alla mappa `sourceLabel`.
3. Stessi due file, riga della sottodescrizione (`PaymentsClient.tsx:94`,
   `ClientPaymentsClient.tsx:533`): mostrare `Preventivo · {quoteNumber}` con lo stesso pattern
   già usato per `Campione · {sampleCode}`.

Entrambe le mappe sono `Record<string, string>` con fallback `?? kind`, quindi anche dimenticando
il punto 2 nulla si rompe: comparirebbe solo la stringa grezza.

### 6.4 Estrarre la logica acconto (funzione pura)

La logica acconto/rate è oggi **duplicata in tre punti** (`purchasePackage:118-193`,
`createSample:478-560`, `createManualPayment:353-431`) e il test
`src/lib/utils/acconto.test.ts` la **replica localmente** invece di importarla (lo dichiara la sua
intestazione).

Creare `src/lib/utils/acconto.ts` con la funzione pura, e usarla nella nuova action:

```ts
export function computeAccontoPlan(input: {
  totalCents: number;
  accontoCents: number;
  installmentsCount: number;
}): {
  hasAcconto: boolean;
  remaining: number;
  isFullyPaid: boolean;
  paidAmountCents: number;
  status: "pending" | "partial" | "paid";
  installmentsCount: number;   // include la rata 0 se c'è acconto
  amounts: number[];           // rate ordinarie, da splitInCents
}
```

Poi far puntare `acconto.test.ts` alla funzione vera (rimuovendo l'helper duplicato nel test).
**Non** migrare ora le tre action esistenti: fuori scope, si fa in un secondo momento.

### 6.5 Derivazione dei crediti (funzione pura)

File nuovo: `src/lib/calc/quoteCredits.ts`

```ts
export interface QuoteCreditDraft {
  analysisId: string;
  analysisNameSnapshot: string;
  quantity: number;            // intero ≥ 1
  totalPriceCents: number;     // unitPriceCents × quantity
}

/**
 * Estrae i crediti da generare dalle righe di un preventivo approvato.
 * Solo righe kind:"analysis" con quantità intera ≥ 1 (decisione 4).
 * Una riga = un credito: righe duplicate sulla stessa analisi NON si fondono,
 * così ogni credito conserva il prezzo della propria riga (il consumo FIFO
 * le usa comunque in sequenza).
 * Funzione PURA.
 */
export function deriveQuoteCredits(items: QuoteItem[]): QuoteCreditDraft[];
```

### 6.6 Aggiornare il dialog di approvazione

`QuoteDetailClient.handleApprove` chiama **solo** `approveQuoteWithPayment` con
`{ quoteId, expectedVersion: quote.version, payment: withPayment ? paymentData : null, packageAssignments }`.

Rimuovere gli import ora inutili (`transitionQuote` resta usata dalle altre transizioni,
`purchasePackage` e `createManualPayment` non servono più in questo file).

⚠️ Con `withPayment === false` i pacchetti **non** vengono più assegnati (decisione 5): aggiornare
il testo del dialog perché lo dica esplicitamente, es. sotto lo switch spento:
*"Senza pagamento non verranno assegnati pacchetti né crediti al cliente."*

---

## 7. Flusso B — consumo e irrobustimento lato campione

### 7.1 `getClientActivePkgs` — nuovi campi e ordinamento

File: `src/server/actions/samples.ts:362`

Oggi ritorna `{ id, packageNameSnapshot, remainingAnalyses }` **senza ordinamento**. Deve
ritornare anche `restrictedToAnalysisId` e `origin`, ordinati per `createdAt` crescente (FIFO,
coerente con il server).

### 7.2 Wizard — filtro e preselezione

- `addAnalysis()` (`SampleWizard.tsx:326-349`): sostituire la `find` attuale con
  `pickSlotForAnalysis(activePackages, analysis.id, remainingMap)`, dove `remainingMap` va
  costruita **sottraendo gli slot già impegnati dagli item presenti nel form** — è ciò che oggi fa
  `usedByPackage`:

  ```ts
  const remainingMap = new Map(
    activePackages.map((p) => [p.id, p.remainingAnalyses - (usedByPackage[p.id] ?? 0)]),
  );
  ```
- `packagesForRow` (`SampleWizard.tsx:446`): filtrare anche per compatibilità con
  `item.analysisId`; mantenere l'eccezione già presente per il pacchetto attualmente selezionato
  (`|| p.id === item?.coveredByPackageId`) così la tendina non "perde" il valore corrente.
- L'etichetta della `<option>` resta `{packageNameSnapshot} ({effectiveRemaining} rimaste)` —
  per i crediti diventa già *"Da preventivo 2026/0034 — pH (2 rimaste)"*. Nessuna modifica.

### 7.3 `createSample` — validazione server-side (nuova, importante)

Oggi `createSample` (`samples.ts:403-475`) **si fida di `coveredByPackageId` inviato dal client**:
calcola i decrementi da quello che arriva e azzera il prezzo di conseguenza. Con i crediti
ristretti questo diventa un rischio concreto (una tab lasciata aperta con pacchetti ormai
esauriti, o una riga con la copertura sbagliata).

Dentro la transazione, dopo aver letto i `pkgSnaps` (già presenti per i decrementi), validare
ogni pacchetto referenziato:

- esiste;
- `clientId` coincide con quello del campione;
- `status === "active"`;
- `remainingAnalyses >=` il conteggio già presente in `packageDecrements` — cioè **solo** gli item
  che consumano davvero (`coveredByPackageId && !chargeAnyway`), non tutti quelli che lo citano;
- se ha `restrictedToAnalysisId`, **tutti** gli item che lo referenziano (anche quelli con
  `chargeAnyway`) hanno quell'`analysisId`: un riferimento incrociato sbagliato è comunque un bug
  della UI e va bloccato.

Questa validazione chiude anche un **buco già presente oggi**: se `coveredByPackageId` punta a un
documento inesistente, il ciclo di decremento lo salta (`if (pkgSnap?.exists)`, `samples.ts:466`)
ma l'item resta marcato come coperto e quindi **gratuito** — nessun decremento e nessun addebito.

Se una verifica fallisce → **fallire con messaggio esplicito**, non correggere in silenzio:

```
"La copertura selezionata non è più valida o disponibile. Ricarica la pagina e riprova."
```

Motivo: un fallback silenzioso a "non coperto" cambierebbe l'importo del campione senza che
l'operatore se ne accorga — l'opposto dell'obiettivo di questo lavoro.

### 7.4 Cosa NON va toccato

- `removeSampleAnalysis` (`samples.ts:307-339`): ripristina lo slot per id e riattiva il pacchetto
  se era `exhausted` — funziona invariato anche per i crediti.
- `computeSampleTotal`: la copertura azzera il costo, indipendentemente dall'origine.
- Il ciclo di decremento in `createSample:464-475`.

---

## 8. Flusso C — badge di stato pagamento

Indipendente dal resto: si può fare per primo, sblocca subito valore.

### 8.1 Widget riusabile

Nuovo file `src/components/widgets/PaymentStatusBadge.tsx`, sullo stampo esatto di
`SampleStatusBadge.tsx`. La mappatura colori esiste già: spostarla da
`ClientPaymentsClient.tsx:93-131` (`PAYMENT_STATUS_CONFIG` + componente locale
`PaymentStatusBadge`) e far importare il widget a `ClientPaymentsClient` — nessun cambio visivo lì.

Aggiungere il caso "nessun pagamento collegato" come variante esplicita
(`status: PaymentStatus | null` → etichetta *"Nessun pagamento"*, stile `muted`), perché è
un'informazione utile quanto le altre.

### 8.2 Dove mostrarlo

| Pagina | File | Come |
|--------|------|------|
| Lista campioni | `src/app/(app)/samples/_components/SamplesClient.tsx` | Nuova colonna "Pagamento" dopo "Stato" |
| Campioni del cliente | `src/app/(app)/clients/[id]/samples/_components/ClientSamplesClient.tsx` | Badge accanto a `SampleStatusBadge` nella riga |
| Dettaglio campione | `src/app/(app)/samples/[id]/_components/SampleDetailClient.tsx` | Nell'header accanto a `SampleStatusBadge` — `linkedPayment` è **già caricato** e oggi usato solo per il banner di disallineamento |

### 8.3 Come recuperare gli stati per le liste

Le liste hanno solo `sample.paymentId`. Aggiungere in `src/server/actions/payments.ts`:

```ts
export async function getPaymentStatusesByIds(
  ids: string[],
): Promise<Record<string, PaymentStatus>>
```

implementata con `adminDb.getAll(...refs)` (una sola andata e ritorno, nessun limite `in` da
gestire, nessun indice nuovo). Chiamarla nei loader `samples/page.tsx` e
`clients/[id]/samples/page.tsx`, passando la mappa ai componenti client.

La mappa è **chiavata per `paymentId`**, non per id campione: nel componente si legge
`sample.paymentId ? map[sample.paymentId] ?? null : null`, e `null` rende il badge
*"Nessun pagamento"*.

⚠️ `getAll()` **lancia un errore se invocata senza reference**: uscire subito con `{}` quando
l'elenco di id è vuoto (campioni senza `paymentId`, pagina vuota). Filtrare anche i `paymentId`
duplicati o `undefined` prima di costruire le reference.

**Niente denormalizzazione** dello stato sul documento campione: richiederebbe di sincronizzare a
ogni incasso, annullamento e ricalcolo overdue del cron — costo e rischio sproporzionati rispetto
a una `getAll` su una pagina da 25 elementi.

---

## 9. Effetti collaterali e bug preesistenti trovati

### 9.1 Pacchetto assegnato gratis (decisione 5)

`QuoteDetailClient.handleApprove:161-174` chiama `purchasePackage` per ogni riga-pacchetto
**indipendentemente** dallo switch "Genera pagamento", sempre con `createPayment: false`. Con lo
switch spento il cliente riceve il pacchetto senza che venga mai creato un pagamento.
Risolto strutturalmente dalla nuova action (§6.2 punto 4).

### 9.2 `createManualPayment` scarta `source`

`payments.ts:360` scrive `source: { kind: "manual" }` **ignorando `data.source`**. Il `refId` del
preventivo inviato dal client (`QuoteDetailClient.tsx:661`) non arriva mai su Firestore: oggi
nessun pagamento è risalibile al preventivo che lo ha generato.

Il flusso principale non passa più da qui (la nuova action scrive il `source` corretto da sé,
§6.3), ma la riga resta un bug latente: qualunque chiamante che valorizzi `source` lo vede
sparire in silenzio. Correzione da 1 riga: scrivere `source: data.source`. Nessun impatto sul
form manuale della tab Pagamenti, che invia `{ kind: "manual" }` senza altri campi.

### 9.3 I referti PDF conteggiano i pacchetti — vanno esclusi i crediti

`ReportPdfDocument` e `ReportCommercialPdfDocument` stampano un riquadro **"Saldo pacchetti
attivi"** con `N° analisi svolte` / `N° analisi rimaste`, sommando *tutti* i clientPackages attivi.
È un documento che va **al cliente finale**: se i crediti da preventivo finissero in quella somma,
il saldo mostrato sarebbe gonfiato e incomprensibile.

Filtrare `origin !== "quote"` in **tutti e tre** i punti che costruiscono `activePackages`:

- `src/server/actions/reports.ts:147-148` (creazione referto)
- `src/server/actions/reports.ts:268-269` (invio email)
- `src/app/api/pdf/report/[id]/route.ts:63-64` (download)

### 9.4 Tab Pacchetti del cliente

I crediti compariranno in `clients/{id}/packages` come voci normali. È desiderabile (trasparenza),
ma vanno distinti: aggiungere un badge secondario *"Da preventivo"* e, se semplice, un link a
`/quotes/{sourceQuoteId}`. La UI non si rompe con `packageId` assente (verificato: non viene mai
letto lì).

### 9.5 `dueAt` vs `dueDate`

Già descritto in §3. Non è un bug da correggere ora — è una convenzione da rispettare: **scrivere
`dueAt`**.

---

## 10. Piano di esecuzione

Ordine pensato per tenere ogni step verificabile da solo. Dopo ogni step: `npm run check`.

| Step | Cosa | File | Fatto quando |
|------|------|------|--------------|
| 1 | Widget `PaymentStatusBadge` estratto, `ClientPaymentsClient` lo importa | `components/widgets/PaymentStatusBadge.tsx` (nuovo), `ClientPaymentsClient.tsx` | La tab Pagamenti è identica a prima |
| 2 | `getPaymentStatusesByIds` + badge nelle 3 viste campione | `server/actions/payments.ts`, `samples/page.tsx`, `clients/[id]/samples/page.tsx`, i 3 componenti client | Un campione pagato mostra "Pagato" in lista e nel dettaglio |
| 3 | Campi nuovi sullo schema + converter | `schemas/package.ts`, `server/actions/clientPackages.ts` (`toClientPackageDoc`) | `npm run typecheck` pulito, pacchetti esistenti invariati |
| 4 | `pickSlotForAnalysis` + nuova firma `assignPackageCoverage` + test aggiornati | `lib/calc/sample.ts`, `lib/calc/sample.test.ts` | I 7 test esistenti passano nella nuova forma + i nuovi di §11 |
| 5 | `deriveQuoteCredits` puro + test | `lib/calc/quoteCredits.ts` (nuovo), `lib/calc/quoteCredits.test.ts` (nuovo) | Test di §11 verdi |
| 6 | `computeAccontoPlan` estratto, test puntato alla funzione vera | `lib/utils/acconto.ts` (nuovo), `lib/utils/acconto.test.ts` | Test esistenti verdi senza helper duplicato |
| 7 | `source.kind = "quote"` + `quoteNumber` nello schema e nelle 2 liste pagamenti (§6.3) | `schemas/payment.ts`, `PaymentsClient.tsx`, `ClientPaymentsClient.tsx` | Un pagamento da preventivo mostra "Preventivo · 2026/0034" |
| 8 | `approveQuoteWithPayment` + schema input | `schemas/quote.ts`, `schemas/index.ts`, `server/actions/quotes.ts` | Approvazione con pagamento crea payment + pacchetti + crediti in un colpo solo |
| 9 | Dialog approvazione usa la nuova action; testo aggiornato per lo switch spento | `QuoteDetailClient.tsx` | Approvando senza pagamento non nasce nulla |
| 10 | Fix bug latente: `createManualPayment` scarta `source` (§9.2) | `server/actions/payments.ts:360` | `source: data.source` |
| 11 | `getClientActivePkgs` con campi nuovi + ordinamento FIFO | `server/actions/samples.ts:362` | Il wizard riceve `restrictedToAnalysisId` |
| 12 | Wizard: preselezione e filtro per analisi | `components/forms/SampleWizard.tsx` | Un credito pH non è selezionabile su Densità |
| 13 | `addSampleAnalyses` passa gli `analysisId` **e** mappa `restrictedToAnalysisId` | `server/actions/samples.ts:220-231` | Aggiungendo Densità a un campione, il credito pH non viene consumato |
| 14 | Validazione server-side in `createSample` | `server/actions/samples.ts` | Copertura incoerente → errore esplicito, nessun addebito alterato |
| 15 | Filtro `origin !== "quote"` nei 3 punti dei referti | `server/actions/reports.ts` ×2, `api/pdf/report/[id]/route.ts` | Il riquadro "Saldo pacchetti" ignora i crediti |
| 16 | Badge "Da preventivo" nella tab Pacchetti | `clients/[id]/packages/_components/ClientPackagesClient.tsx` | Un credito è distinguibile a colpo d'occhio |
| 17 | *(facoltativo)* Sul dettaglio preventivo: "crediti generati, X/Y usati" | `quotes/[id]/page.tsx` + client | Query `where("sourceQuoteId","==",id)`, nessun indice nuovo |

---

## 11. Test da scrivere (solo funzioni pure, come da convenzione)

**`src/lib/calc/sample.test.ts`** — adeguare i 7 esistenti alla nuova firma e aggiungere:

- un credito ristretto a `an_ph` **non** copre `an_densita` → `coverage = [null]`, `decrements = {}`;
- con credito ristretto + pacchetto generico entrambi disponibili per la stessa analisi, si
  consuma **prima** il ristretto;
- credito ristretto esaurito → si passa al generico;
- più analisi diverse in un colpo: ognuna prende il proprio credito ristretto, le altre il generico;
- un pacchetto generico continua a coprire qualsiasi analisi (nessuna regressione).

**`src/lib/calc/quoteCredits.test.ts`** (nuovo):

- riga `kind:"free"` → nessun credito;
- riga `kind:"package"` → nessun credito (la gestisce `purchasePackage`);
- riga `kind:"analysis"` con `quantity: 2.5` → nessun credito (decisione 4);
- riga `kind:"analysis"` con `quantity: 3` → un credito con `totalAnalyses: 3` e
  `totalPriceCents = unitPriceCents × 3`;
- due righe sulla stessa analisi → due crediti distinti, non fusi;
- lista vuota → `[]`.

**`src/lib/utils/acconto.test.ts`**: invariato nei casi, ma importando `computeAccontoPlan`.

---

## 12. Fuori scope (deciso, non dimenticato)

- **Backfill dello storico**: i preventivi già approvati non generano crediti retroattivi.
  Per un caso singolo si usa l'assegnazione manuale di un pacchetto dalla UI esistente.
- **Cascata annullamento pagamento → pacchetto/credito**: oggi annullare un `Payment` non revoca
  il pacchetto collegato (`cancelPayment` non tocca `clientPackages`). Comportamento preesistente,
  invariato anche per i crediti.
- **Migrazione delle tre action esistenti a `computeAccontoPlan`**: si fa dopo, separatamente.
- **Scadenza dei crediti**: un credito non consumato resta attivo a tempo indeterminato, come un
  pacchetto.

---

## 13. Checklist finale prima di considerare chiuso

- [x] `npm run check` verde (typecheck + lint + test + build)
- [x] Approvazione **con** pagamento: nascono payment (con `source.kind: "quote"` e `refId`),
      pacchetti e crediti insieme
- [x] Approvazione **senza** pagamento — o con importo €0 — non crea né payment, né pacchetto,
      né credito
- [x] Un credito pH non è selezionabile né assegnabile automaticamente su un'altra analisi
      (verificato sia nel wizard — `addAnalysis`/`packagesForRow` — sia in "aggiungi analisi"
      nel dettaglio campione — `addSampleAnalyses`)
- [x] I crediti ristretti vengono consumati prima dei pacchetti generici (coperto da test in
      `sample.test.ts`)
- [x] Rimuovendo l'analisi dal campione, lo slot del credito torna disponibile (nessuna modifica
      necessaria a `removeSampleAnalysis`, già invariante rispetto all'origine dello slot)
- [x] Il riquadro "Saldo pacchetti attivi" dei referti PDF **non** include i crediti (filtro
      `origin !== "quote"` nei 3 punti che costruiscono `activePackages`)
- [x] Le rate nuove sono scritte con `dueAt`
- [x] Nessuna modifica a `firestore.rules` né a `firestore.indexes.json`
- [x] Un campione pagato mostra "Pagato" in lista campioni, scheda cliente e dettaglio

### Nota di implementazione — scoperto durante l'esecuzione, non previsto dal piano originale

`ClientSamplesClient.tsx` (lista campioni nella scheda cliente) aveva una propria interfaccia
locale `ActivePkg` senza `restrictedToAnalysisId`. Il campo veniva quindi scartato silenziosamente
proprio nel percorso più comune per creare un campione con cliente già selezionato (il bottone
"Nuovo campione" dalla scheda cliente) — un credito da preventivo sarebbe apparso nel wizard come
un pacchetto generico, vanificando la restrizione. Corretto allineando l'interfaccia locale al
tipo di ritorno di `getClientActivePkgs`.
