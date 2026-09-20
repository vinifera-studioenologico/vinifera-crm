# Riepilogo analisi in corso per categoria — documento di sviluppo

> **Obiettivo**: in cima alla sezione campioni, una card per ogni categoria di analisi con il
> totale delle analisi in corso; cliccandola si apre l'elenco, campione per campione.
>
> **Stato**: da implementare. **Fonte**: appunti cliente 20/09/2026, punto #6.

---

## 1. Richiesta del cliente

> *"Aggiungere sezione di riepilogo sulla sezione campioni. Ci saranno delle card di riepilogo,
> una per ogni categoria di analisi, che avrà al suo interno il totale delle analisi in corso di
> quella categoria. Al click della card avrai un popup con ogni riga il nome del campione e sotto
> le analisi che quel campione ha per quella categoria, quindi se più di uno ci sarà: nome
> campione e sotto 1+n righe di analisi."*

---

## 2. Stato attuale

### Come sono modellate le analisi di un campione

- Le analisi sono un **catalogo top-level** `analyses` (`src/server/actions/analyses.ts:17`),
  con `category` come **stringa libera opzionale** (`src/schemas/analysis.ts:5-15`,
  `category: z.string().max(100).optional()`). Non esiste una tassonomia, né un enum, né una
  collection di categorie. L'input è a `src/components/forms/AnalysisForm.tsx:142`, la colonna a
  `src/app/(app)/analyses/_components/AnalysesClient.tsx:136-143`.
- Un campione **non** referenzia le analisi: le **incorpora** come array `items[]` di snapshot —
  `SampleItemSchema` (`src/schemas/sample.ts:14-24`): `analysisId`, `analysisCodeSnapshot`,
  `analysisNameSnapshot`, `unitPriceCents`, `coveredByPackageId?`, `chargeAnyway`,
  `result?` (stringa ≤500).
- **Lo snapshot non contiene la categoria**: va ricavata dal catalogo `analyses` tramite
  `analysisId`.
- Non esiste uno stato per singola analisi: lo stato (`pending | in_progress | completed |
  cancelled`, `sample.ts:5-10`) è solo del campione. L'unico segnale per riga è `item.result`,
  che la UI mostra come "Risultato inserito" / "In attesa"
  (`SampleDetailClient.tsx:735-743`).

### La pagina campioni

`src/app/(app)/samples/page.tsx` (server, `force-dynamic`) carica `getSamples()`, `getClients()`,
`getAnalyses()` e `getPaymentStatusesByIds()` e passa tutto a
`src/app/(app)/samples/_components/SamplesClient.tsx` (filtri in memoria `:56-65`, chip di stato
`:214-226`, `DataTable`, contatori di intestazione a `:168-170` — **è lì che vanno le card**).

⚠️ **`getSamples()` è paginata** (`src/server/actions/samples.ts:73`, `PAGE_SIZE`). I conteggi
delle card **non possono** essere calcolati sui campioni già caricati in pagina: darebbero numeri
sbagliati appena i campioni superano una pagina. Serve una lettura dedicata.

### Pezzi riusabili

- `src/components/widgets/KpiCard.tsx` — `{ title, icon, value?, description?, trend?, loading?,
  className? }`. **Non è cliccabile** (nessuna prop `onClick`).
- Griglia di riferimento: `dashboard/_components/DashboardClient.tsx:154`
  (`grid grid-cols-2 gap-4 lg:grid-cols-4`).
- Dialog con ricerca e lista scrollabile, ottimo modello per il popup:
  `SampleDetailClient.tsx:877-953`. Componenti disponibili: `dialog.tsx`, `scroll-area.tsx`,
  `badge.tsx`, `card.tsx`.

---

## 3. Decisioni tecniche

1. **Conteggio server-side, in una lettura sola.** Una nuova Server Action legge tutti i campioni
   `in_progress` più il catalogo analisi e restituisce l'albero completo già pronto: categorie →
   campioni → analisi. Il popup non fa altre fetch. I campioni in lavorazione in un laboratorio
   sono nell'ordine delle decine: è una lettura sostenibile, e non è paginata proprio perché il
   totale deve essere il totale.
2. **La logica di raggruppamento è una funzione pura**, testata. È la convenzione del progetto
   (i test coprono solo funzioni pure, niente tocca Firestore) ed è anche la parte dove è facile
   sbagliare i conteggi.
3. **"Analisi in corso" = tutte le analisi dei campioni in stato `in_progress`.** È la lettura
   letterale della richiesta. Dentro il popup ogni riga mostra comunque se il risultato è già
   stato inserito, così l'informazione più fine resta visibile senza cambiare il conteggio.
   *(Punto aperto F del documento di raccolta.)*
4. **Le analisi senza categoria non si perdono**: finiscono in un bucket "Senza categoria",
   mostrato per ultimo. Visto che `category` è una stringa libera opzionale, oggi è un caso
   normale, non un'anomalia.
5. Le categorie si **normalizzano** per il raggruppamento (trim; confronto case-insensitive)
   ma si **mostrano** con la grafia del catalogo: "Chimiche" e "chimiche" non devono produrre due
   card.
6. Card cliccabile: si avvolge `KpiCard` in un `<button type="button">`, **senza modificare il
   componente condiviso** — serve solo qui.

---

## 4. Implementazione

### 4.1 Funzione pura — `src/lib/calc/samples-summary.ts` (nuovo)

```ts
export interface CategoryAnalysisRow { analysisId: string; code: string; name: string; hasResult: boolean }
export interface CategorySampleGroup {
  sampleId: string; code: string; sampleName: string; clientName: string;
  rows: CategoryAnalysisRow[];
}
export interface CategorySummary {
  key: string;            // categoria normalizzata, "" per il bucket senza categoria
  label: string;          // etichetta da mostrare
  count: number;          // totale analisi in corso della categoria
  groups: CategorySampleGroup[];
}

export function groupInProgressAnalysesByCategory(
  samples: SampleDoc[],
  analyses: AnalysisDoc[],
): CategorySummary[]
```

Regole: si considerano solo i campioni passati in input (il filtro di stato lo fa il chiamante);
per ogni `item` si risolve la categoria via `analysisId` sul catalogo; `hasResult` è
`Boolean(item.result?.trim())`; `count` è il numero di righe analisi, **non** di campioni;
ordinamento delle categorie per `count` decrescente, con "Senza categoria" sempre in fondo;
dentro ogni categoria i campioni ordinati per codice.

Test in `src/lib/calc/samples-summary.test.ts`: campione con più analisi della stessa categoria
(deve contare N, non 1); analisi con categoria mancante o stringa vuota; varianti di grafia
("Chimiche" / "chimiche " → una sola card); analisi presente nell'item ma **non più nel
catalogo** (eliminata o archiviata: deve finire in "Senza categoria", non far crashare il
raggruppamento).

### 4.2 Server Action — `src/server/actions/samples.ts`

```ts
export async function getInProgressAnalysesSummary(): Promise<CategorySummary[]>
```

`requireAdmin()` come prima istruzione; query `samples` con **il solo filtro
`status == "in_progress"`**; catalogo via `getAnalyses({ includeArchived: true })` (servono anche
le analisi archiviate, altrimenti i campioni che le contengono perdono la categoria); delega a
`groupInProgressAnalysesByCategory`. Nessun `revalidatePath` (è una lettura).

⚠️ **Due trappole da non ignorare, entrambe verificate sul codice:**

1. **Niente filtro `deletedAt == null` sui campioni.** `SampleDocSchema`
   (`src/schemas/sample.ts:99-122`) **non ha** quel campo: i campioni si annullano con
   `status: "cancelled"` e `cancelledAt`. Su documenti privi del campo, Firestore restituisce
   **zero risultati** per `where("deletedAt", "==", null)` — le card risulterebbero sempre vuote,
   senza alcun errore visibile. (Il filtro è invece corretto e necessario sul **catalogo
   analisi**, che `deletedAt` ce l'ha: lo gestisce già `getAnalyses`.)
2. **Il tipo di ritorno è un valore semplice, non `ActionResult`.** In questo progetto
   `ActionResult<T>` è il ritorno delle scritture; le letture restituiscono il valore diretto
   (`getSample` → `SampleDoc | null`, `getSamples` → `PaginatedResult`).

Con un solo filtro di uguaglianza e nessun `orderBy` non serve alcun indice composito: non c'è
niente da aggiungere a `firestore.indexes.json`.

### 4.3 Pagina — `src/app/(app)/samples/page.tsx`

Aggiungere la chiamata a `getInProgressAnalysesSummary()` accanto alle fetch esistenti e passare
il risultato a `SamplesClient`.

### 4.4 Componente — `src/app/(app)/samples/_components/AnalysesSummaryCards.tsx` (nuovo)

- griglia `grid grid-cols-2 gap-4 lg:grid-cols-4` come in dashboard;
- una card per categoria: titolo = etichetta categoria, valore = `count`, descrizione = numero di
  campioni coinvolti (es. "su 4 campioni");
- ogni card è un `<button type="button" className="text-left">` che avvolge `KpiCard`;
- al click, `Dialog` con:
  - titolo = nome categoria + totale,
  - per ogni campione: una riga intestazione con **nome campione**, codice e cliente, che è un
    link a `/samples/{id}`;
  - sotto, **una riga per analisi** di quel campione in quella categoria, con codice, nome e un
    `Badge` "Risultato inserito" / "In attesa" (riusare le etichette già in uso);
  - contenuto in `ScrollArea`, come il dialog di `SampleDetailClient.tsx:877-953`.
- se non ci sono analisi in corso, **non rendere nulla**: niente griglia di card vuote.

### 4.5 Montaggio — `SamplesClient.tsx`

Rendere `<AnalysesSummaryCards />` **sopra** i filtri e la tabella, vicino ai contatori di
intestazione (`:168-170`). Su mobile la griglia deve scendere a 2 colonne (lo fa già la classe
indicata) e non generare scroll orizzontale.

---

## 5. Criteri di accettazione

- [ ] Le card compaiono in cima a `/samples`, una per categoria di analisi presente fra i
      campioni **in lavorazione**.
- [ ] Il numero su ogni card è il **totale delle analisi**, non dei campioni: un campione con 3
      analisi della stessa categoria conta 3.
- [ ] La somma dei numeri di tutte le card è pari al totale delle analisi di tutti i campioni in
      lavorazione (verificabile a mano su pochi campioni di prova).
- [ ] I conteggi **non cambiano** cambiando pagina o filtro nella tabella sottostante: sono
      calcolati su tutti i campioni in lavorazione, non su quelli visibili.
- [ ] Al click si apre un popup con, per ogni campione, il nome in testa e sotto le sue analisi di
      quella categoria; un campione con 3 analisi mostra 1 intestazione + 3 righe.
- [ ] Le analisi senza categoria compaiono in una card "Senza categoria", in fondo.
- [ ] Un'analisi archiviata o cancellata dal catalogo ma ancora presente in un campione non fa
      sparire il campione né genera errori.
- [ ] Senza campioni in lavorazione la sezione non compare affatto.
- [ ] Dal popup si raggiunge il dettaglio del campione con un click.
- [ ] Su iPad/mobile la griglia resta leggibile e non scrolla orizzontalmente.
- [ ] `npm run check` verde, test della funzione pura inclusi.
