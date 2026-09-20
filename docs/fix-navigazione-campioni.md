# Frecce campioni: sblocco dopo il completamento — documento di sviluppo

> **Obiettivo**: completare un campione non deve più lasciare l'operatore su un vicolo cieco.
> Alla conferma del completamento si passa automaticamente al primo campione ancora in lavorazione.
>
> **Stato**: da implementare. **Fonte**: appunti cliente 20/09/2026, punto #3.

---

## 1. Richiesta del cliente

> *"Parlando delle frecce per passare da uno in lavorazione all'altro: quando ne completi uno
> rimani concettualmente bloccato perché diventa completato e spariscono le frecce. Soluzione:
> quando completi una ti va automaticamente sulla prima in lavorazione."*

La soluzione indicata dal cliente è la **navigazione automatica**: è quella da implementare.

---

## 2. Stato attuale — perché le frecce spariscono

Catena completa, verificata sul codice:

1. `src/app/(app)/samples/[id]/page.tsx:27-30` calcola le frecce **lato server**:

   ```ts
   sample.status === "in_progress" ? getAdjacentInProgressSamples(id) : { prevId: null, nextId: null }
   ```

2. `getAdjacentInProgressSamples` (`src/server/actions/samples.ts:113-134`) interroga
   `samples where status == "in_progress" orderBy createdAt desc`, cerca `indexOf(currentId)` e
   restituisce i vicini. Se `idx === -1` restituisce `{ prevId: null, nextId: null }`.

3. `src/app/(app)/samples/[id]/_components/SampleDetailClient.tsx:456-484` rende il blocco frecce
   solo se `(adjacentIds.prevId || adjacentIds.nextId)` (condizione a `:457`). L'equivalente
   mobile è lo swipe a `:129-234` / `:419-432`.

4. `handleTransition("completed")` (`SampleDetailClient.tsx:274-304`) chiama `updateSampleStatus`
   (`src/server/actions/samples.ts:656`) e poi `router.refresh()` a `:298`.

Al refresh lo stato del campione è `completed`, quindi il ternario al punto 1 corto-circuita a
`{null, null}` — e anche se non lo facesse, il campione è uscito dalla query `in_progress`,
quindi `idx === -1`. Le frecce spariscono in entrambi i modi: è un doppio blocco, non basta
togliere il ternario.

---

## 3. Decisioni tecniche

1. La navigazione la decide il **server**, non il client: dopo l'update lo stato in cache del
   client è già superato, e il prossimo campione va comunque letto da Firestore.
2. Si aggiunge **una nuova Server Action di sola lettura**, non si modifica
   `getAdjacentInProgressSamples` (che continua a servire le frecce) né `updateSampleStatus`
   (azione generica, non deve sapere nulla di navigazione).
3. Si naviga con `router.replace`, non `push`: il campione appena completato non deve finire
   nella cronologia "indietro" come se fosse una pagina a sé da rivisitare.
4. "Prima in lavorazione" = **il primo risultato dello stesso ordinamento già usato dalle
   frecce** (`createdAt desc`), così il concetto di "primo" è uno solo in tutta la feature.
5. Il campione appena completato va escluso esplicitamente dal risultato: fra l'update e la
   lettura successiva Firestore può ancora restituirlo.

---

## 4. Implementazione

### 4.1 Nuova action — `src/server/actions/samples.ts`

Aggiungere accanto a `getAdjacentInProgressSamples` (`:113`), riusandone la forma di query:

```ts
export async function getFirstInProgressSampleId(
  excludeId: string,
): Promise<string | null> {
  await requireAdmin();
  // stessa query delle frecce: samples status == "in_progress", orderBy createdAt desc
  // primo id diverso da excludeId, altrimenti null
}
```

⚠️ **Il tipo di ritorno è un valore semplice, non `ActionResult`.** In questo progetto
`ActionResult<T>` è il ritorno delle **scritture**; le letture restituiscono il valore diretto —
`getSample` ritorna `SampleDoc | null` (`:105`), `getAdjacentInProgressSamples` ritorna un oggetto
semplice (`:113`), `getSamples` un `PaginatedResult` (`:73`). Seguire quella convenzione.

Riusare anche `.select()` come fa `getAdjacentInProgressSamples` (`:122`): servono solo gli id,
non i documenti interi. Nessun `revalidatePath` (è una lettura).

⚠️ **Non aggiungere un filtro `deletedAt == null`**: `SampleDocSchema` non ha quel campo (i
campioni si annullano con `status: "cancelled"` + `cancelledAt`). Su documenti privi del campo,
una `where("deletedAt", "==", null)` restituisce **zero risultati**.

### 4.2 `SampleDetailClient.tsx` — `handleTransition` (`:274-304`)

Dopo l'esito positivo della transizione, **solo quando il nuovo stato è `"completed"`**:

1. chiamare `getFirstInProgressSampleId(sample.id)`;
2. se torna un id → `router.replace(`/samples/${id}`)` e toast di conferma del tipo
   *"Campione completato — passo al prossimo in lavorazione"*;
3. se torna `null` → comportamento attuale (`router.refresh()`) e toast
   *"Campione completato — nessun altro campione in lavorazione"*.

Per ogni altra transizione (annullamento, rimessa in lavorazione, ecc.) **non cambia nulla**:
resta `router.refresh()`.

Attenzione a non introdurre uno stato di caricamento incoerente: il pulsante deve restare
disabilitato finché la navigazione non è partita, altrimenti si vede per un istante la pagina del
campione completato con i pulsanti riattivati.

---

## 5. Criteri di accettazione

Da verificare **con l'app in esecuzione** (`npm run dev`), serve più di un campione in lavorazione:

- [ ] Con 3 campioni in lavorazione, completandone uno si viene portati automaticamente su uno
      degli altri due, che si apre in lavorazione e **mostra le sue frecce**.
- [ ] Da lì si può completare ancora e si passa al successivo: si riesce a smaltire la coda senza
      mai tornare alla lista a mano.
- [ ] Completando **l'ultimo** campione in lavorazione si resta sulla sua pagina, senza errori,
      con un messaggio che dice che non ce ne sono altri.
- [ ] Il tasto "indietro" del browser dopo la navigazione automatica non riporta sul campione
      appena completato.
- [ ] Annullare un campione (o qualunque altra transizione) **non** fa navigare da nessuna parte.
- [ ] Su iPad lo swipe fra campioni continua a funzionare come prima.
- [ ] `npm run check` verde.

---

## 6. Fuori scope (non farlo in questa sessione)

Negli appunti il cliente ipotizzava anche di **mantenere le frecce sui campioni completati**, per
poi scartarla a favore della navigazione automatica. Non va implementata: la navigazione
automatica risolve il flusso, e tenere le frecce su un campione completato richiederebbe di
ridefinire cosa siano "i vicini" per un campione fuori dalla lista in lavorazione. Se dopo l'uso
sul campo il cliente la richiede comunque, è una modifica isolata al ternario di
`samples/[id]/page.tsx:28` più la gestione di `idx === -1` in `getAdjacentInProgressSamples`.
