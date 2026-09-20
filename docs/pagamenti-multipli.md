# Incasso multiplo di più rate — documento di sviluppo

> **Obiettivo**: selezionare più rate in sospeso e registrarle come un unico incasso, con data,
> metodo e nota condivisi, invece di aprire il form una rata alla volta.
>
> **Stato**: da implementare. **Fonte**: appunti cliente 20/09/2026, punto #5.

---

## 1. Richiesta del cliente

> *"Pagamenti da spuntare multipli (rendilo selezionabili e fai pagamento unico per tutti),
> magari note uniche per tutti."*

---

## 2. Stato attuale

### Modello (`src/schemas/payment.ts`)

- `payments/{paymentId}` — `PaymentDocSchema` (`:107-121`): `clientId`, `source`, `description`,
  `notes?`, `totalAmountCents`, `paidAmountCents`, `status`, `installmentsCount`, `version`, …
- `payments/{paymentId}/installments/{installmentId}` — `InstallmentDocSchema` (`:126-138`):
  `index`, `dueDate`, `amountCents`, `status`, `paidAt?`, `paidAmountCents?`, `method?`,
  `note?` (max 500)
- `payments/{paymentId}/transactions/{id}` — `TransactionDocSchema` (`:143-153`), log immutabile
- stati rata: `pending | paid | overdue | cancelled` (`:15-20`)
- metodi: `cash | bank_transfer | card | other` (`:24-29`)
- input singolo: `MarkInstallmentPaidSchema` (`:76-83`) — `paymentId`, `installmentId`,
  `paidAmountCents` (`zEurInput` → centesimi), `method`, `paidAt` `"YYYY-MM-DD"`, `note?`

⚠️ **Il campo scritto su Firestore è `dueAt`, non `dueDate`** (`payments.ts:408`, `:437`), anche
se lo schema lo chiama `dueDate`; il reader accetta entrambi (`payments.ts:50-53`, `:62`).

### Azione esistente — `markInstallmentPaid` (`src/server/actions/payments.ts:143-283`)

`requireAdmin()` → `adminDb.runTransaction` → legge rata + pagamento + **tutte** le rate
(`:173-182`) → rifiuta rate già pagate/annullate (`:190-191`) → guardia sul sovra-pagamento
(`:195-199`) → ricalcola lo stato con `derivePaymentStatus` (`:219-223`) → scrive la rata
(`:228-235`) e il pagamento (`:238-243`, `version` incrementato) → appende la transazione
(`:246-260`) → aggiorna `clients/{id}.stats` (`:263-271`) → `revalidatePath("/payments")` e
`"/clients"` (`:274-275`).

`derivePaymentStatus` è puro, in `src/lib/calc/payment.ts:26-45`, ed è **l'unico autorizzato a
scrivere `payments.status`**.

### UI

La schermata dove oggi si segna una rata come pagata è
`src/app/(app)/clients/[id]/payments/_components/ClientPaymentsClient.tsx`: **non** è una
`DataTable`, è una lista di card espandibili (`installments.map` a `:553`) con
`MarkInstallmentPaidForm` per riga (`:387`) ed etichette metodo a `:320`.
Il form è `src/components/forms/MarkInstallmentPaidForm.tsx` (schema client duplicato a `:27-34`,
etichette metodo a `:37-42`, textarea nota a `:170`).

**Precedente da imitare per la selezione multipla**:
`src/app/(app)/clients/[id]/reports/_components/ClientReportsClient.tsx` — `useState<Set<string>>`
(`:61`), `Checkbox` per riga (`:179-180`), barra di selezione (`:142-155`), campo note condiviso
applicato all'intero batch (`:63`). Il `DataTable` condiviso
(`src/components/data-table/DataTable.tsx`) **non** supporta la row selection, ma qui non serve:
questa schermata non lo usa.

---

## 3. Decisioni tecniche

1. **Si lavora sulla schermata rate del cliente** (`/clients/{id}/payments`): è l'unica dove
   esiste l'azione "segna pagato". La lista globale `/payments` mostra pagamenti, non rate, e non
   ha azioni di incasso. *(Punto aperto E del documento di raccolta: se il cliente intendeva la
   lista globale, la logica server resta identica e cambia solo dove si monta la UI.)*
2. **L'incasso multiplo salda ogni rata selezionata per intero.** L'importo parziale resta una
   funzione del form singolo: in un'azione massiva non esiste un modo sensato di ripartire una
   cifra parziale su più rate, e inventarne uno significherebbe scrivere importi che nessuno ha
   deciso. Il totale mostrato è la somma degli `amountCents` selezionati.
3. **Selezionabili solo le rate `pending` o `overdue`.** Su rate `paid`/`cancelled` la checkbox
   non compare — così la guardia server non viene mai colpita dall'uso normale.
4. **Una transazione Firestore per pagamento**, non una per rata e non una sola globale: le rate
   selezionate possono appartenere a pagamenti diversi, e ogni transazione deve leggere e
   riscrivere il proprio documento pagamento in modo coerente. Le transazioni si eseguono in
   sequenza.
5. **Non toccare `markInstallmentPaid`.** Resta il percorso del form singolo, con il suo importo
   parziale. La parte condivisa da estrarre è solo la **validazione pura** di "questa rata è
   incassabile", così la regola vive in un posto solo ed è testabile.
6. La nota è **una sola, applicata a tutte** le rate selezionate e a tutte le transazioni
   generate: è la richiesta esplicita del cliente ("note uniche per tutti").

---

## 4. Implementazione

### 4.1 Funzione pura — `src/lib/calc/payment.ts`

```ts
export function isInstallmentPayable(status: InstallmentStatus): boolean
```

`true` per `pending` e `overdue`, `false` per `paid` e `cancelled`. Usata dalla UI per decidere
se mostrare la checkbox e dall'azione server come guardia.

Test in `src/lib/calc/payment.test.ts` (o nel file test già presente per questo modulo): i
quattro stati, uno per caso.

### 4.2 Schema — `src/schemas/payment.ts`

```ts
export const MarkInstallmentsPaidBulkSchema = z.object({
  items: z.array(z.object({
    paymentId: z.string().min(1),
    installmentId: z.string().min(1),
  })).min(1).max(50),
  method: PaymentMethodSchema,
  paidAt: /* stessa forma "YYYY-MM-DD" di MarkInstallmentPaidSchema */,
  note: z.string().max(500).optional(),
});
```

Riesportare da `src/schemas/index.ts` come gli altri.

### 4.3 Azione — `src/server/actions/payments.ts`

```ts
export async function markInstallmentsPaidBulk(raw: unknown): Promise<ActionResult<void>>
```

Passi:

1. `requireAdmin()` come prima istruzione, poi parse con lo schema.
2. Raggruppare `items` per `paymentId`.
3. Per ogni pagamento, **una** `adminDb.runTransaction`:
   - **prima tutte le letture**: documento pagamento + tutte le sue rate (stessa forma di
     `payments.ts:173-182`);
   - scartare le rate non incassabili secondo `isInstallmentPayable` — se una rata selezionata
     è già stata pagata nel frattempo, **non** far fallire l'intero batch: contarla come saltata
     e proseguire;
   - per ogni rata da incassare, scrivere `{ status: "paid", paidAt, paidAmountCents:
     amountCents, method, note: data.note ?? null, updatedAt }` (stessa forma di `:228-235`);
   - ricalcolare lo stato del pagamento con `derivePaymentStatus` sull'insieme aggiornato delle
     rate — **mai** scriverlo a mano;
   - aggiornare il pagamento: `paidAmountCents` incrementato della somma incassata, nuovo
     `status`, `version: FieldValue.increment(1)`, `updatedAt`;
   - appendere **una transazione per rata** nella subcollection `transactions`, con `method` e la
     nota condivisa (stessa forma di `:246-260`): il log resta granulare, una riga per rata.
4. Accumulare per `clientId` il delta di `stats.pendingAmountCents` e `stats.totalRevenueCents`
   e applicarlo **una volta sola per cliente** al termine (stessa semantica di `:263-271`).
5. `revalidatePath("/payments")` e `revalidatePath("/clients")`.
6. Ritornare quante rate sono state incassate e quante saltate, così la UI può dirlo all'utente.

Ricordare: l'Admin SDK rifiuta i campi `undefined` (usare `null` o omettere la chiave).

### 4.4 UI — `ClientPaymentsClient.tsx`

Seguire il modello di `ClientReportsClient.tsx`:

- `const [selected, setSelected] = useState<Set<string>>(new Set())`, con chiave
  `` `${paymentId}:${installmentId}` `` (le rate hanno `id` unico solo dentro il loro pagamento);
- `Checkbox` shadcn su ogni riga rata **solo se** `isInstallmentPayable(inst.status)`;
- comoda ma non obbligatoria: una checkbox "seleziona tutte le incassabili" nell'intestazione
  della card di un pagamento;
- **barra di selezione** visibile quando `selected.size > 0`, con: numero rate selezionate,
  **totale in euro** (somma degli `amountCents`, formattato con gli helper esistenti in
  `src/lib/utils/money.ts`), pulsante "Registra incasso unico", pulsante "Annulla selezione";
- il pulsante apre uno **Sheet** (regola UX: Sheet per i form rapidi, Dialog solo per conferme
  critiche) contenente:
  - riepilogo in sola lettura delle rate selezionate (pagamento, rata, importo),
  - **totale**,
  - data incasso (default oggi),
  - metodo, con le etichette già in uso: Contanti / Bonifico / Carta / Altro
    (`MarkInstallmentPaidForm.tsx:37-42`),
  - **nota unica** (textarea, max 500), con testo d'aiuto che chiarisce che vale per tutte le rate;
- alla conferma: chiamata a `markInstallmentsPaidBulk`, toast con l'esito (incassate N, saltate M
  se M > 0), `setSelected(new Set())`, `router.refresh()`;
- la selezione va azzerata anche se l'azione fallisce a metà, per non lasciare spunte che non
  rispecchiano più i dati.

Il form singolo esistente resta dov'è e come è.

---

## 5. Criteri di accettazione

- [ ] Sulle rate `pending`/`overdue` compare una checkbox; su `paid`/`cancelled` no.
- [ ] Selezionando 3 rate la barra mostra "3 rate selezionate" e il **totale corretto** in euro.
- [ ] Confermando l'incasso unico: le 3 rate risultano `paid` con la **stessa data, stesso metodo
      e stessa nota**, e lo stato del pagamento passa a `partial` o `paid` secondo le regole di
      `derivePaymentStatus` (non forzato a mano).
- [ ] Selezionando rate appartenenti a **pagamenti diversi**, tutte vengono incassate e ogni
      pagamento aggiorna correttamente il proprio `paidAmountCents` e il proprio stato.
- [ ] Nella subcollection `transactions` compare **una riga per rata**, con metodo e nota.
- [ ] Le statistiche del cliente (`stats.pendingAmountCents`, `stats.totalRevenueCents`) tornano
      coerenti: incassare 3 rate da 100 € in blocco lascia gli stessi numeri che si otterrebbero
      incassandole una per una col form singolo.
- [ ] Se una rata selezionata viene pagata da un'altra sessione nel frattempo, il batch non va in
      errore: le altre vengono incassate e l'esito segnala quella saltata.
- [ ] Il form singolo rata continua a funzionare, **importo parziale incluso**.
- [ ] `npm run check` verde, con il test della funzione pura incluso.
