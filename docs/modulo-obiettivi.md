# Modulo Obiettivi annuali — documento di sviluppo

> **Obiettivo**: obiettivi annuali impostabili dall'utente, con avanzamento calcolato sui dati
> reali del CRM, riepilogo in dashboard e reset automatico a ogni anno nuovo.
>
> **Stato**: da implementare — **modulo greenfield**. **Fonte**: appunti cliente 20/09/2026, punto #8.

---

## 1. Richiesta del cliente

> *"Inserire il modulo 'Obiettivi' con sezione apposita e riepilogo in dashboard. Annuali, che
> scadono a fine anno e si resettano a ogni anno; ogni anno, finché non li setti, ti richiede di
> settarli."*

---

## 2. Stato attuale

**Non esiste nulla.** Una ricerca su `src/` per `obiettiv|goal|target|budget` restituisce solo
falsi positivi: `e.target.value`, `target="_blank"`, `cancelTarget`, `targetMarginPercent` del
modulo pricing (`src/app/(app)/costs/pricing/page.tsx:15`,
`src/app/(app)/costs/_components/PricingTable.tsx:30,33`) e variabili locali `targetYear`/
`targetMonth` in `stats.ts:198` e `costs.ts:591-592`.

Servono quindi: schema, collection, actions, rotta, voce di menu e innesto in dashboard.

### Dove si innesta

- **Dashboard**: `src/app/(app)/dashboard/page.tsx` — server, chiama `getDashboardStats()` con
  try/catch e fallback `EMPTY_STATS` (`:7-18`), rende `<DashboardClient stats={stats} />`.
  `DashboardClient.tsx` ha una griglia di 8 `KpiCard` (`:154-207`,
  `grid grid-cols-2 lg:grid-cols-4`) e due sezioni lista
  (`<section className="rounded-xl border border-border bg-card p-5">`, `:212-229` e `:232-251`).
- **Sidebar**: `src/components/app-shell/Sidebar.tsx`, gruppo **Commerciale** (`:75-82`) —
  oggi `/quotes`, `/payments`, `/stats`, `/costs`. Anche `MobileNav.tsx:53` ("More") e
  `COMMAND_NAV` in `Topbar.tsx:58-68`.
- **Fonti dati per l'avanzamento**: `getMonthlyStats` (`src/server/actions/stats.ts:195-246`)
  per gli incassi; `samples` e `clients` per i conteggi.

---

## 3. Decisioni tecniche

1. **Un documento per anno, con l'anno come id**: `goals/{"2026"}`. Rende impossibile per
   costruzione avere due set di obiettivi per lo stesso anno, e la lettura è diretta (niente
   query, niente indice).
2. **Il "reset annuale" non richiede nessun job.** Il 1° gennaio il documento dell'anno nuovo
   semplicemente non esiste: l'app mostra il sollecito a impostarlo e lo storico degli anni
   precedenti resta consultabile. Nessun cron, nessuna scadenza da gestire, nessuno stato da
   azzerare. Gli anni passati **non si toccano**: restano come fotografia.
3. **Gli obiettivi si salvano, l'avanzamento si calcola.** Nel documento vanno solo i valori
   target impostati dall'utente. Il progresso si ricalcola sempre dai dati reali: salvarlo
   significherebbe mantenerlo aggiornato a ogni incasso, campione e cliente nuovo.
4. **Tre metriche, tutte opzionali** — *punto aperto B, da validare col cliente*:
   - **fatturato incassato** nell'anno (centesimi),
   - **numero campioni** accettati nell'anno,
   - **numero nuovi clienti** acquisiti nell'anno.
   Il modello è pensato perché aggiungerne una quarta costi una voce nello schema, una nel
   calcolo e una nella UI.
5. **Il sollecito è un richiamo persistente, non un modal bloccante.** Un modal che appare a ogni
   accesso finché non lo compili, su un gestionale usato da iPad in laboratorio, viene chiuso per
   riflesso e smette di comunicare. Una card in cima alla dashboard, che resta finché gli
   obiettivi non ci sono, ottiene lo stesso risultato senza intralciare. *(Se il cliente vuole
   esplicitamente il modal, è una variante localizzata alla dashboard.)*
6. **Il fatturato dell'obiettivo usa la stessa fonte di "Entrate mensili".** Se la statistica e
   l'obiettivo calcolassero gli incassi in due modi diversi, mostrerebbero due numeri diversi per
   la stessa cosa: riusare `getMonthlyStats` o la sua identica forma di query.

---

## 4. Implementazione

### 4.1 Schema — `src/schemas/goal.ts` (nuovo)

```ts
export const GoalFormSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  revenueTargetCents: zEurInput.optional(),      // fatturato incassato
  samplesTarget: z.number().int().min(0).optional(),
  newClientsTarget: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional(),
});

export const GoalDocSchema = GoalFormSchema.extend({
  id: z.string(),                                 // == String(year)
  version: z.number().int().min(0),
  createdAt: z.any(),                             // Timestamp
  updatedAt: z.any(),                             // Timestamp
  deletedAt: z.any().nullable(),                  // Timestamp
});
```

⚠️ **Non esiste nessun `zTimestamp`** in `src/schemas/validators.ts`. La convenzione del progetto
per i campi Timestamp è `z.any()` con commento — vedi `SampleDocSchema`
(`src/schemas/sample.ts:120-121`) e `ExpenseDocSchema` (`src/schemas/cost.ts:65-67`). I validator
realmente disponibili e utili qui sono `zCents` e `zEurInput`.

Importi in **centesimi** (`zEurInput`/`zCents` da `src/schemas/validators.ts`), come ovunque.
Riesportare da `src/schemas/index.ts`. Almeno un target deve essere valorizzato (refine):
salvare un obiettivo completamente vuoto equivale a non averlo impostato, e farebbe sparire il
sollecito senza motivo.

### 4.2 Calcolo puro — `src/lib/calc/goals.ts` (nuovo)

```ts
export interface GoalMetricProgress {
  target: number; current: number; percent: number; remaining: number; onTrack: boolean;
}
export function computeGoalProgress(target: number | undefined, current: number, now: Date): GoalMetricProgress | null
```

- `percent` limitato a 100 per la barra, ma il **valore reale** va comunque mostrato quando si
  supera il target (superare del 130% è un'informazione, non un errore da troncare in silenzio);
- `onTrack`: confronta la percentuale raggiunta con la **frazione di anno trascorsa** — a fine
  giugno, essere al 50% è in linea;
- ritorna `null` se il target non è impostato.

Test in `src/lib/calc/goals.test.ts`: target assente, target 0, progresso a 0, superamento del
100%, `onTrack` a inizio/metà/fine anno.

### 4.3 Actions — `src/server/actions/goals.ts` (nuovo)

`"use server";` + `import "server-only";`, `requireAdmin()` come prima istruzione in ognuna.
Collection `goals` (costante `COL` nel file, come negli altri action file), converter
`toGoalDoc()` scritto a mano con bracket notation.

```ts
export async function getGoal(year: number): Promise<GoalDoc | null>
export async function upsertGoal(raw: unknown): Promise<ActionResult<void>>   // id = String(year)
export async function getGoalProgress(year: number): Promise<GoalProgress>
export async function getGoalYears(): Promise<number[]>                        // per lo storico
```

⚠️ **Solo la scrittura ritorna `ActionResult`.** In questo progetto le letture restituiscono il
valore diretto (`getSample` → `SampleDoc | null`, `getSamples` → `PaginatedResult`), le mutazioni
ritornano `ActionResult<T>` (`markInstallmentPaid`, `updatePayment`…). Rispettare la convenzione.

`getGoalProgress` raccoglie i valori correnti:

- **fatturato**: stessa query di `getMonthlyStats` (`stats.ts:202-215`) — collection group
  `installments`, `status == "paid"`, `paidAt` nell'anno, somma `paidAmountCents ?? amountCents`;
- **campioni**: `samples` con `receivedAt` nell'anno (è la data di rilevanza operativa, non
  `createdAt`), escludendo `status == "cancelled"`. **Nessun filtro `deletedAt`**: i campioni non
  hanno quel campo (`src/schemas/sample.ts:99-122`) e filtrarci sopra restituirebbe zero
  risultati;
- **nuovi clienti**: `clients` con `createdAt` nell'anno e `deletedAt == null`;

poi delega a `computeGoalProgress` per ogni metrica. Restituisce anche `hasGoals: boolean`, che è
ciò che pilota il sollecito.

`upsertGoal` scrive con `set(..., { merge: true })` su `goals/{year}`, incrementando `version` e
aggiornando `updatedAt`; `revalidatePath("/obiettivi")` e `revalidatePath("/dashboard")`.
Ricordare che l'Admin SDK rifiuta i campi `undefined`: un target non impostato va omesso o scritto
`null`.

Verificare se le query richiedono indici compositi; in tal caso aggiornare
`firestore.indexes.json`. Aggiungere la collection `goals` a `firestore.rules` (deny-by-default:
senza regola esplicita non è leggibile).

### 4.4 Pagina — `src/app/(app)/obiettivi/` (nuova)

`page.tsx` server component che carica `getGoalProgress(annoCorrente)` e `getGoalYears()`.

`_components/ObiettiviClient.tsx`:

- **anno corrente in evidenza**: una card per metrica impostata, con valore attuale, target,
  barra di avanzamento, percentuale, quanto manca, e un segnale "in linea / in ritardo" basato su
  `onTrack`;
- se gli obiettivi dell'anno **non** sono impostati: stato vuoto con un invito esplicito e il
  pulsante per impostarli;
- **modifica in uno Sheet** (regola UX: Sheet per i form rapidi), con React Hook Form + Zod e gli
  importi in euro convertiti con `src/lib/utils/money.ts`;
- **storico**: gli anni precedenti in sola lettura, con il risultato finale raggiunto. Non
  modificabili dall'interfaccia: sono una fotografia chiusa.

Rotta in italiano (`/obiettivi`), coerente con `/servizi` già presente.

### 4.5 Dashboard

`src/app/(app)/dashboard/page.tsx`: caricare `getGoalProgress(annoCorrente)` **come prop
separata**, non dentro `DashboardStats`. Motivo: `DashboardStats` (`stats.ts:65-75`) ha un
fallback `EMPTY_STATS` (`page.tsx:7-18`) e gonfiarla costringerebbe a tenere allineati due posti
per ogni campo nuovo. Stesso trattamento con try/catch: un errore sugli obiettivi non deve far
cadere la dashboard.

`DashboardClient.tsx`:

- **se `hasGoals === false`** → in cima, prima della griglia KPI, una card di sollecito:
  *"Obiettivi {anno} non ancora impostati"* + pulsante che porta a `/obiettivi`. È il "te li
  richiede finché non li setti" della richiesta.
- **se impostati** → una terza `<section>` con le barre di avanzamento, nello stesso stile delle
  sezioni "Ultimi campioni" (`:212-229`) e "Prossimi promemoria" (`:232-251`), con link a
  `/obiettivi`.

### 4.6 Navigazione

Voce **"Obiettivi"** nel gruppo *Commerciale* della sidebar (`Sidebar.tsx:75-82`), icona
`lucide-react` stroke 1.75 coerente con le altre (es. `Target`). Aggiungere anche in
`MobileNav.tsx:53` (sheet "More") e in `COMMAND_NAV` (`Topbar.tsx:58-68`).

---

## 5. Criteri di accettazione

- [ ] `/obiettivi` esiste, è raggiungibile da sidebar, barra mobile e palette ⌘K.
- [ ] Impostando un obiettivo di fatturato annuo, la pagina mostra valore attuale, target,
      percentuale e quanto manca.
- [ ] Il **fatturato mostrato coincide** con il totale incassato dell'anno nelle statistiche: i
      due numeri non devono mai divergere.
- [ ] Le metriche non impostate non compaiono: non si vedono barre a zero senza significato.
- [ ] Superato il target, la UI mostra il superamento (es. 130%) senza rompersi né fermarsi a 100.
- [ ] Con obiettivi **non** impostati per l'anno corrente, la dashboard mostra la card di
      sollecito in cima; una volta impostati, la card sparisce e compare l'avanzamento.
- [ ] Cambiando anno (verificabile impostando obiettivi su un anno diverso) i dati mostrati sono
      quelli di quell'anno; gli anni passati restano in sola lettura.
- [ ] Un obiettivo completamente vuoto non è salvabile.
- [ ] La collection `goals` è coperta da `firestore.rules`; senza sessione admin le action
      rispondono con errore di autorizzazione.
- [ ] Un errore nel caricamento degli obiettivi non fa cadere la dashboard.
- [ ] `npm run check` verde, test di `computeGoalProgress` inclusi.

---

## 6. Punto aperto

**Quali metriche** vuole davvero il cliente (punto aperto B del documento di raccolta). Le tre
proposte — fatturato, campioni, nuovi clienti — sono quelle che il CRM sa già calcolare con
precisione e senza dati aggiuntivi. Se ne chiede altre (es. margine, ticket medio, obiettivi per
tipo di analisi), verificare **prima** che il dato esista già: alcune richiederebbero un modulo
di costi per analisi che oggi non c'è.
