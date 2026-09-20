# Statistiche: spese per categoria, incassi per metodo, audit dati — documento di sviluppo

> **Obiettivo**: rendere la sezione statistiche affidabile e leggibile — verificare che i numeri
> esistenti siano corretti, aggiungere l'analisi delle spese per categoria e sottocategoria con
> grafici a torta, e mostrare quanto si incassa per metodo di pagamento.
>
> **Stato**: da implementare. **Fonte**: appunti cliente 20/09/2026, punto #7.

Il lavoro ha **tre parti**. Si consiglia di eseguirle nell'ordine in cui sono scritte: l'audit
(§5) può cambiare il modo in cui si scrivono le aggregazioni delle parti successive.

---

## 1. Richiesta del cliente

> *"Sezione commerciale > statistiche. Verificare validità dei dati. Campioni per stato: riusare
> il grafico per metterci le spese divise per categorie (fornitori, utenze (acqua e luce e
> immondizia)). Aggiungere subcategorie tipo affitto, bolla fornitore ecc. per fare grafici a
> torta. Per crearle usa le spese già esistenti. Al click va in una pagina con i grafici a torta.
> Altro grafico per capire quanto incassa con bonifico o contante."*

---

## 2. Stato attuale

### Pagina statistiche

`src/app/(app)/stats/page.tsx` — server component, `force-dynamic`, chiama
`getMonthlyStats(currentYear)` e `getSamplesByMonth()` e passa i risultati come props a
`StatsClient`. **Nessun hook React Query**: i dati sono fetchati lato server e passati giù.
Esiste `stats/loading.tsx`. La rotta `/stats` **non ha layout né nav**.

`src/app/(app)/stats/_components/StatsClient.tsx` (`"use client"`):

| Elemento | Righe | Note |
|---|---|---|
| KPI cards | 134-170 | `Card` semplici, non `KpiCard` |
| "Entrate mensili" | 181-219 | recharts `BarChart`, da `getMonthlyStats` |
| **"Campioni per stato (ultimi 6 mesi)"** | 224-299 | recharts **`LineChart`**, 4 `<Line>` — **è il grafico da riusare come modello** |
| Tooltip | 28-44, 46-62 | `EurTooltip` e `CountTooltip`, custom |
| Stato vuoto | 301-309 | `Card` dedicata |

Libreria: **recharts** `^3.8.1` usata grezza. **Non esiste** un wrapper shadcn
`src/components/ui/chart.tsx`. **Non esiste nessun grafico a torta in tutto il repo**:
`PieChart`, `Pie` e `Cell` vanno importati per la prima volta. Colori oggi cablati a mano
(`#10b981`, `#3b82f6`, `#f59e0b`, `#6b7280`); griglia `CartesianGrid stroke="hsl(var(--border))"`.

### Spese

`src/schemas/cost.ts`:

- **`ExpenseCategorySchema`** (`:5-13`) — enum fisso, **nessuna sottocategoria**:
  `supplier_invoice`, `utility`, `maintenance`, `consumable`, `kit_purchase`, `fixed_cost`,
  `other`
- `ExpenseFormSchema` (`:17-47`): `description`, `category`, `supplier?`, `invoiceNumber?`,
  `date` (`"YYYY-MM-DD"`), `periodFrom?`/`periodTo?`, `totalCents`, `notes?`, `items?[]`
- `ExpenseDocSchema` (`:51-68`): aggiunge `id`, `pdfStoragePath?`, `aiParsed`, `fileHash?`,
  `fixedCostRef?`, `version`, `createdAt`, `updatedAt`, `deletedAt`
- `FixedCostFormSchema` (`:76-95`): `name`, `amountCents`, `frequency`
  (`monthly|quarterly|annual`), `paymentDay`, `paymentMonth?`, `active`, `notifyTelegram`,
  `reminderDaysBefore`

**Le etichette italiane delle categorie sono duplicate in due file**:
`src/app/(app)/costs/_components/ExpensesTable.tsx:38-46` e
`src/components/forms/ExpenseForm.tsx:34-44` → Bolla fornitore / Bolletta / Manutenzione /
Materiale consumo / Acquisto kit / Costo fisso / Altro.

Actions in `src/server/actions/costs.ts` (collection `costExpenses`, `costFixedCosts`,
`costKits`, `settings/costs` a `:26-29`); `getCostsSummary(month, year)` a `:584` raggruppa già
le spese e fa il pro-rata dei periodi (categoria letta a `:631` e `:665`).

### Incassi per metodo

`PaymentMethodSchema` (`src/schemas/payment.ts:24-29`) esiste già: **`cash` | `bank_transfer` |
`card` | `other`** — quattro valori, non due. Il metodo sta **sulla rata**
(`InstallmentDocSchema.method?`, `:134`) e sulla transazione, ed è **opzionale**.

`getMonthlyStats` (`src/server/actions/stats.ts:195-246`) fa già esattamente la query che serve:
collection group `installments` con `status == "paid"` e `paidAt` nell'anno, sommando
`paidAmountCents ?? amountCents`.

⚠️ L'acconto ("rata 0") creato da `createManualPayment` (`payments.ts:404-413`) viene scritto con
`status: "paid"` e **senza `method`**: esiste quindi un insieme legittimo di incassi senza metodo.

---

## 3. Decisioni tecniche

1. **Le sottocategorie sono un campo nuovo, opzionale, con tassonomia in una sola costante.**
   Non si tocca l'enum `ExpenseCategorySchema` esistente: le categorie di primo livello restano
   quelle, le nuove voci ("affitto", "acqua", "luce", "immondizia"…) sono **sottocategorie**.
2. **Nessun backfill dello storico.** Le spese già registrate restano senza sottocategoria e
   confluiscono in un bucket "Non specificata". È la stessa scelta fatta per i crediti da
   preventivo, e riclassificare a posteriori spese decise da altri significherebbe inventare dati.
3. **Un colore per categoria, uguale ovunque.** Una sola palette esportata, usata da tutti i
   grafici: se "utenze" è arancione nella torta dev'essere arancione anche nel grafico mensile.
4. **Le etichette vanno consolidate, non triplicate.** Sono già duplicate in due file e questo
   lavoro ne aggiungerebbe un terzo consumatore: si spostano in un'unica costante e i due file
   esistenti la importano.
5. **Gli incassi senza metodo si mostrano, non si nascondono.** Un bucket "Non specificato" è
   obbligatorio: altrimenti il totale del grafico per metodo non torna con "Entrate mensili" e
   il grafico diventa esso stesso un dato inaffidabile — il contrario dell'obiettivo.
6. **L'audit non "sistema" i numeri in silenzio.** Ogni discrepanza va capita e riportata: una
   correzione non spiegata su dati contabili è peggio del bug.

---

## 4. Parte A — Sottocategorie di spesa

### 4.1 Tassonomia — `src/lib/constants/expenses.ts` (nuovo)

Un solo file con: etichette delle categorie (spostate da `ExpensesTable.tsx:38-46` e
`ExpenseForm.tsx:34-44`), elenco sottocategorie per categoria, palette colori per categoria.

Tassonomia iniziale proposta — **da validare col cliente, punto aperto C**:

| Categoria | Sottocategorie proposte |
|---|---|
| `supplier_invoice` (Bolla fornitore) | Reagenti, Vetreria, Materiale di consumo, Trasporti, Altro fornitore |
| `utility` (Bolletta) | Acqua, Luce, Gas, Immondizia, Telefonia/Internet |
| `maintenance` (Manutenzione) | Strumenti, Locali, Software |
| `consumable` (Materiale consumo) | *(nessuna)* |
| `kit_purchase` (Acquisto kit) | *(nessuna)* |
| `fixed_cost` (Costo fisso) | Affitto, Assicurazione, Commercialista, Abbonamenti software, Compensi |
| `other` (Altro) | *(nessuna)* |

Le chiavi restano in inglese, le etichette in italiano, come nel resto del progetto. Le categorie
senza sottocategorie non mostrano il campo.

### 4.2 Schema — `src/schemas/cost.ts`

Aggiungere `subcategory: z.string().max(100).optional()` a `ExpenseFormSchema`/`ExpenseDocSchema`
**e** a `FixedCostFormSchema`/`FixedCostDocSchema`. Sul costo fisso serve perché la Cloud
Function genera automaticamente la spesa alla scadenza: la sottocategoria (es. "Affitto") deve
essere **ereditata** dalla spesa generata, altrimenti l'automatismo produce spese non
classificate.

Validare che la sottocategoria appartenga alla categoria scelta (refine sullo schema): impedisce
combinazioni assurde tipo `utility` + `Affitto`.

### 4.3 Propagazione ai costi fissi

`functions/src/index.ts` crea il documento `costExpenses` quando un costo fisso scade (guardia
`lastExpenseCreatedForDue`). Va aggiunto il passaggio del campo `subcategory` dal costo fisso alla
spesa generata. **Ricordare che `functions/` è un deployable separato**: build e deploy manuali
(`npm --prefix functions run build`, `firebase deploy --only functions`).

### 4.4 UI costi

- `src/components/forms/ExpenseForm.tsx`: select "Sottocategoria" dipendente dalla categoria,
  nascosto quando la categoria non ne ha; si azzera al cambio di categoria.
- `src/app/(app)/costs/_components/ExpensesTable.tsx`: mostrare la sottocategoria (colonna a sé
  o sotto-testo della categoria) e includerla nella ricerca testuale.
- Entrambi importano etichette e tassonomia da `src/lib/constants/expenses.ts`.
- Form del costo fisso: stesso campo.

---

## 5. Parte B — Audit di validità dei dati

Il cliente ha chiesto di *"verificare validità dei dati"* senza indicare quali numeri gli
sembrassero sbagliati (**punto aperto D**). Va quindi fatta una verifica mirata sui punti dove il
codice è oggi realmente a rischio. **Deliverable: un documento `docs/audit-statistiche.md`** con,
per ogni punto, cosa è stato verificato, su quali dati, l'esito e — se c'è un problema — la
correzione proposta.

Punti da verificare, già individuati leggendo il codice:

1. **`dueDate` vs `dueAt`.** Lo schema dichiara `dueDate`, tutti i writer scrivono `dueAt`, il
   reader accetta entrambi (`payments.ts:50-62`) ma **cron e statistiche interrogano solo
   `dueAt`**. Verificare se in produzione esistono rate con il solo `dueDate` (es. da
   `scripts/seed-dev.ts`): sarebbero invisibili al calcolo degli scaduti e alle statistiche.
2. **`paidAmountCents ?? amountCents`** in `getMonthlyStats` (`stats.ts:202-215`). Una rata
   `paid` senza `paidAmountCents` viene contata per l'intero importo. Verificare quante ce ne
   sono — in particolare gli acconti "rata 0" di `createManualPayment` (`payments.ts:404-413`) —
   e se il fallback sovrastima gli incassi.
3. **Doppio conteggio dei costi fissi.** `getCostsSummary` (`costs.ts:584`, logica a `:625-660`)
   fa il pro-rata dei costi fissi *e* la Cloud Function crea una spesa reale `costExpenses` alla
   scadenza. Verificare che lo stesso costo non entri due volte nei totali.
4. **Soft delete.** Controllare che **ogni** query di aggregazione filtri `deletedAt == null`:
   una spesa o un campione cancellato che continua a pesare sui totali è esattamente il tipo di
   errore che il cliente percepisce come "i dati non tornano".
5. **Confini di mese e anno.** Le aggregazioni per mese usano date calcolate nel fuso del server
   (UTC su Vercel), non in `Europe/Rome`: un incasso registrato il 1° alle 00:30 italiane può
   cadere nel mese precedente. Verificare e, se confermato, normalizzare usando `TZ` da
   `src/lib/utils/date.ts` (stessa classe di problema del modulo #1).
6. **`version` sui pagamenti.** `markInstallmentPaid` incrementa `version` senza mai leggerlo né
   confrontarlo (`payments.ts:238-243`): la concorrenza ottimistica sui pagamenti oggi **non
   protegge nulla**. Non è un bug di statistica: va **riportato nel documento**, non risolto qui.

Per i punti 1, 2 e 4 conviene uno script `tsx` di sola lettura in `scripts/` che conti le
occorrenze sui dati reali e stampi un riepilogo: è ripetibile e lascia una traccia verificabile.

---

## 6. Parte C — Grafici

### 6.1 Palette

In `src/lib/constants/expenses.ts`, un colore per ciascuna delle 7 categorie, più un grigio per
"Non specificata". Devono restare distinguibili sullo sfondo verde del tema chiaro (vedi modulo
#2) e in tema scuro.

### 6.2 Aggregazioni — `src/server/actions/stats.ts`

```ts
export async function getExpensesByCategoryMonthly(year: number): Promise<ExpensesByMonth[]>
export async function getExpensesBreakdown(year: number): Promise<ExpensesBreakdown>
export async function getIncomeByMethod(year: number): Promise<IncomeByMethod[]>
```

⚠️ Tipi di ritorno **semplici, non `ActionResult`**: in questo progetto `ActionResult<T>` è il
ritorno delle scritture, le letture restituiscono il valore diretto — come fanno già
`getMonthlyStats` e `getSamplesByMonth` nello stesso file.

- `getExpensesByCategoryMonthly` — spese dell'anno (`costExpenses`, `deletedAt == null`)
  raggruppate per mese e categoria: alimenta il grafico mensile su `/stats`.
  *(Il filtro `deletedAt == null` qui è corretto: le spese hanno quel campo — vedi
  `costs.ts:94`, `:261`, `:399`. Non vale per i campioni, che non ce l'hanno.)*
- `getExpensesBreakdown` — totali dell'anno per categoria, **e dentro ciascuna** i totali per
  sottocategoria (bucket "Non specificata" incluso): alimenta la pagina delle torte.
- `getIncomeByMethod` — collection group `installments`, `status == "paid"`, `paidAt` nell'anno,
  raggruppati per `method`, sommando `paidAmountCents ?? amountCents`. **Stessa identica forma di
  query di `getMonthlyStats`** (`stats.ts:202-215`), così i due grafici non possono divergere.
  Le rate senza `method` finiscono nel bucket `unspecified`.

Il raggruppamento puro (righe → totali per categoria/sottocategoria/metodo) va estratto in
`src/lib/calc/` e testato, come da convenzione del progetto.

Verificare se le query richiedono indici compositi nuovi: in tal caso aggiornare
`firestore.indexes.json` insieme al codice.

### 6.3 `/stats` — due grafici nuovi

Entrambi seguono il modello di **"Campioni per stato"** (`StatsClient.tsx:224-299`):
`ResponsiveContainer`, `CartesianGrid stroke="hsl(var(--border))"`, tooltip custom riusando
`EurTooltip` per gli importi, stessa `Card` contenitore e stesso stato vuoto (`:301-309`).

1. **"Spese per categoria"** — `LineChart` con una `<Line>` per categoria, stessa forma del
   grafico campioni che il cliente ha indicato. La card è **cliccabile** e porta a
   `/stats/spese`, con un'affordance esplicita (icona e testo "Vedi dettaglio", non solo il
   cursore).
2. **"Incassi per metodo"** — è il primo grafico a torta del repo: `PieChart` + `Pie` + `Cell`
   da recharts, con legenda che riporta importo e percentuale per ciascun metodo (Contanti,
   Bonifico, Carta, Altro, Non specificato).

### 6.4 `/stats/spese` — pagina di dettaglio (nuova)

`src/app/(app)/stats/spese/page.tsx`, server component come `/stats`, che carica
`getExpensesBreakdown(anno)`:

- **torta principale**: spese dell'anno per categoria, con totale al centro (donut) o accanto;
- **torte per sottocategoria**: una per ogni categoria che ha sottocategorie valorizzate;
- selettore dell'anno, coerente con quello eventualmente già presente su `/stats`;
- **link "torna alle statistiche"** in testa. Non aggiungere una nav a tab: `/stats` non ha un
  layout e questa è una pagina con uno scopo solo (regola no-tab di PROJECT_SPEC.md §17);
- stato vuoto esplicito se per quell'anno non ci sono spese.

---

## 7. Criteri di accettazione

**Parte A — sottocategorie**

- [ ] Creando una spesa di categoria "Bolletta" si può scegliere fra Acqua/Luce/Gas/Immondizia/
      Telefonia; cambiando categoria in "Acquisto kit" il campo sparisce e il valore si azzera.
- [ ] Le spese esistenti continuano a salvarsi e a modificarsi senza sottocategoria.
- [ ] Un costo fisso con sottocategoria "Affitto" genera (alla scadenza, via Cloud Function) una
      spesa che **eredita** "Affitto".
- [ ] Le etichette delle categorie sono definite in un solo file e importate dagli altri: non
      esistono più due elenchi duplicati.

**Parte B — audit**

- [ ] Esiste `docs/audit-statistiche.md` con i 6 punti di §5, ciascuno con esito esplicito.
- [ ] Ogni eventuale correzione ai calcoli è motivata nel documento, con il numero prima e dopo.
- [ ] Nessun numero è stato "aggiustato" senza spiegazione.

**Parte C — grafici**

- [ ] `/stats` mostra "Spese per categoria" e "Incassi per metodo" con i dati dell'anno corrente.
- [ ] Il totale del grafico "Incassi per metodo" **coincide** con il totale incassato di "Entrate
      mensili" dello stesso anno. Se non coincide, la differenza è spiegata (ed è il motivo per
      cui il bucket "Non specificato" deve esistere).
- [ ] Cliccando la card delle spese si arriva a `/stats/spese`.
- [ ] `/stats/spese` mostra la torta per categoria e le torte per sottocategoria; la somma degli
      spicchi coincide col totale spese dell'anno.
- [ ] Una categoria ha **lo stesso colore** nel grafico mensile e nelle torte.
- [ ] Le spese senza sottocategoria compaiono come "Non specificata", non spariscono.
- [ ] Anni senza dati mostrano lo stato vuoto, non un grafico rotto o un pannello bianco.
- [ ] Leggibilità verificata **a schermo** in tema chiaro e scuro, e su iPad.
- [ ] `npm run check` verde, test delle funzioni pure di aggregazione inclusi.
