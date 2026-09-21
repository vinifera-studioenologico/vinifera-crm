# Piano di esecuzione — lavori da appunti cliente 20/09/2026

> **Questo file si esegue.** Contiene la sequenza dei lavori, il protocollo da seguire e lo stato
> di avanzamento. La sessione che lavora **aggiorna questo file** man mano, così non si perde il
> filo fra una sessione e l'altra.
>
> Contesto, appunti originali e punti aperti:
> [`appunti-cliente-2026-09-20.md`](./appunti-cliente-2026-09-20.md).

---

## Come si esegue

Un comando per **fase**, non per singolo modulo:

```
Esegui la Fase 1 di docs/PIANO-ESECUZIONE.md
```

La sessione svolge in sequenza tutti i punti di quella fase, seguendo il protocollo qui sotto.

**Perché a fasi e non tutto in una volta**: dieci moduli in una sessione sola significano
contesto saturo e un diff unico impossibile da rivedere. Una fase per sessione tiene i lavori
correlati insieme e ogni modulo nel suo commit.

### Protocollo — vale per ogni punto numerato

1. **Leggi il documento del modulo** indicato al punto. È la fonte autoritativa: si segue quello,
   non si reinterpreta e non si allarga il lavoro ad altri moduli.
2. **Implementa.**
3. **`npm run check`** (typecheck + lint + test + build) deve essere **verde**. Se non lo è, si
   sistema prima di proseguire.
4. **Verifica i criteri di accettazione** del documento, davvero. Dove dice "verificare a
   schermo", si avvia `npm run dev` e si guarda.
5. **Commit singolo per modulo** — mai due moduli nello stesso commit. Messaggio in inglese, come
   da convenzione del repo.
6. **Aggiorna questo file**: spunta la casella del punto, metti la data e scrivi nel Registro in
   fondo cosa chi viene dopo deve sapere (scelte fatte, cose rimaste fuori, sorprese nel codice).
7. **Passa al punto successivo** della fase. A fine fase, fermati e riepiloga.

### Quando fermarsi e chiedere

- Il documento è ambiguo o contraddice il codice che trovi → **fermati e segnala**, non decidere
  al posto del cliente.
- `npm run check` non torna verde e la causa è fuori dal modulo → **fermati e segnala**.
- Un punto è marcato **🔒 BLOCCATO** → non iniziarlo, serve prima una risposta del cliente.

---

## Fase 1 — Quick win

> Comando: `Esegui la Fase 1 di docs/PIANO-ESECUZIONE.md`
> Tre lavori piccoli e isolati, nessun prerequisito. Servono anche a verificare che il flusso
> documento → sessione funzioni.

### ✅ 1. Fix fuso orario nelle notifiche

- **Documento**: [`fix-timezone-notifiche.md`](./fix-timezone-notifiche.md)
- **In una riga**: le date nelle notifiche Telegram/email vanno formattate in `Europe/Rome`,
  oggi escono in UTC e l'orario è sfasato.
- **⚠️ Dopo il commit serve un passaggio manuale**, non basta il merge:
  ```bash
  npm --prefix functions run build
  firebase deploy --only functions
  ```
  La Cloud Function non è nel `npm run build`, non è nel deploy Vercel e non è nella CI.
- **Fatto quando**: un promemoria delle 09:00 arriva su Telegram scritto `09:00`, in ora legale e
  in ora solare.

### ✅ 2. Frecce campioni dopo il completamento

- **Documento**: [`fix-navigazione-campioni.md`](./fix-navigazione-campioni.md)
- **In una riga**: completando un campione si resta bloccati perché spariscono le frecce; deve
  portare automaticamente al primo campione ancora in lavorazione.
- **Fatto quando**: con 3 campioni in lavorazione si riesce a smaltirli tutti senza tornare alla
  lista a mano, e sull'ultimo non si rompe niente.

### ✅ 3. Clienti: liste separate aziende e privati

- **Documento**: [`clienti-aziende-privati.md`](./clienti-aziende-privati.md)
- **In una riga**: due pagine distinte, `/clients/aziende` e `/clients/privati`, con colonne
  pertinenti a ciascun tipo. Il modello dati non cambia: il campo `type` esiste già.
- **Attenzione**: tocca Sidebar, MobileNav e palette ⌘K; e serve sistemare i `revalidatePath`,
  altrimenti creando un cliente la lista non si aggiorna.
- **Fatto quando**: le due liste sono complete e disgiunte, e creando un cliente compare subito
  in quella giusta.

---

## Fase 2 — Operatività quotidiana

> Comando: `Esegui la Fase 2 di docs/PIANO-ESECUZIONE.md`
> Il valore più alto per chi usa il gestionale tutti i giorni. Nessuna dipendenza dal cliente.
> **L'ordine conta**: il punto 4 tocca la lista campioni, il 5 il dettaglio.

### ✅ 4. Riepilogo analisi per categoria

- **Documento**: [`riepilogo-analisi-per-categoria.md`](./riepilogo-analisi-per-categoria.md)
- **In una riga**: card in cima a `/samples`, una per categoria di analisi, col totale delle
  analisi in corso; al click un popup con campione e relative analisi.
- **Attenzione**: i conteggi **non** si calcolano sui campioni caricati in pagina (`getSamples` è
  paginata) e **non** si filtra su `deletedAt` (i campioni non hanno quel campo — restituirebbe
  zero risultati in silenzio). Entrambe le trappole sono spiegate nel documento.
- **Fatto quando**: la somma dei numeri sulle card è pari al totale delle analisi dei campioni in
  lavorazione, e non cambia filtrando la tabella sotto.

### ⬜ 5. Ping Telegram su schermata inattiva

- **Documento**: [`ping-inattivita-telegram.md`](./ping-inattivita-telegram.md)
- **In una riga**: se il dettaglio di un campione in lavorazione resta aperto un'ora senza che
  nessuno tocchi niente, parte un messaggio Telegram.
- **Fatto quando**: abbassando temporaneamente la soglia il messaggio arriva, interagendo il
  conteggio riparte, e ne arriva **uno solo** per apertura di pagina. Rimettere la soglia a un'ora
  prima del commit.

### ⬜ 6. Incasso multiplo di più rate

- **Documento**: [`pagamenti-multipli.md`](./pagamenti-multipli.md)
- **In una riga**: selezionare più rate in sospeso e registrarle in un colpo solo, con data,
  metodo e **nota condivisa**.
- **Fatto quando**: incassare 3 rate in blocco lascia gli stessi identici numeri che si
  otterrebbero incassandole una per una col form singolo — stats cliente comprese.

---

## Fase 3 — 🔒 Bloccata: serve una risposta dal cliente

> **Non iniziare questi punti prima di aver avuto la risposta indicata.** Si rischia di rifare il
> lavoro da capo. Le domande sono nel dettaglio in
> [`appunti-cliente-2026-09-20.md` §4](./appunti-cliente-2026-09-20.md).

### ⬜ 7. Tema verde biliardo — *parzialmente sbloccato*

- **Documento**: [`tema-verde-biliardo.md`](./tema-verde-biliardo.md)
- **Serve sapere**: quale tonalità di verde.
- **Si può comunque fare**: implementare la **variante A** (verde salvia chiaro), mostrarla a
  video al cliente e farsi confermare. Se la vuole più marcata, la variante B è già scritta nel
  documento: sei valori da cambiare.
- **Fatto quando**: il cliente ha visto e confermato, e i badge di stato restano leggibili sul
  nuovo sfondo — in particolare il verde "completed" su fondo verde.

### ⬜ 8. 🔒 Statistiche: spese, incassi, audit dati

- **Documento**: [`statistiche-spese-e-incassi.md`](./statistiche-spese-e-incassi.md)
- **Serve sapere**: **(a)** l'elenco definitivo delle sottocategorie di spesa — nel documento c'è
  una proposta da fargli validare; **(b)** *quali numeri* gli sembravano sbagliati.
- **Nota**: è il lavoro che aggiunge il campo `subcategory` alle spese. Più si aspetta, più spese
  si accumulano senza quel campo — quindi **sbloccarlo presto** col cliente, anche se si esegue
  dopo.
- La parte **audit** (§5 del documento) si può fare anche senza la risposta (b): ci sono già tre
  rischi concreti individuati leggendo il codice. Produce `docs/audit-statistiche.md`.

### ⬜ 9. 🔒 Modulo Obiettivi

- **Documento**: [`modulo-obiettivi.md`](./modulo-obiettivi.md)
- **Serve sapere**: quali metriche vuole come obiettivo annuale. La proposta nel documento è
  fatturato incassato, numero campioni, nuovi clienti — tutte già calcolabili dai dati esistenti.
- **Attenzione**: tocca Sidebar/MobileNav/⌘K come il punto 3. Se il 3 non è ancora stato fatto,
  farlo prima.

---

## Fase 4 — Il modulo grosso

> Comando: `Esegui la Fase 4 di docs/PIANO-ESECUZIONE.md`
> **Da solo, in una sessione dedicata.** Non accorparlo ad altro.

### ⬜ 10. Assistente AI

- **Documento**: [`assistente-ai.md`](./assistente-ai.md)
- **In una riga**: chat nel CRM che risponde su qualunque dato del gestionale e cita le entità
  con link cliccabili.
- **Perché per ultimo**: legge trasversalmente tutto: ogni modulo già chiuso è una cosa in più
  che sa raccontare, senza doverci tornare sopra.
- **Attenzione**: aggiunge la dipendenza `@anthropic-ai/sdk` e usa `claude-opus-5`. Prima di
  scrivere il codice dell'SDK va invocata la skill `claude-api` e lette le pagine indicate nel
  documento — le firme non vanno ricostruite a memoria.
- **Fatto quando**: su 10 domande varie non produce nessun link rotto, e l'incassato che riporta
  coincide con quello di `/stats`.

---

## Conflitti fra moduli

Procedendo in sequenza non è un problema. Se si aprono branch paralleli, tenere separati nel
tempo il punto 3 e il punto 9.

| File | Punti che lo toccano |
|------|----------------------|
| `src/components/app-shell/Sidebar.tsx` | 3, 9 |
| `src/components/app-shell/MobileNav.tsx` | 3, 9 |
| `src/components/app-shell/Topbar.tsx` (`COMMAND_NAV`) | 3, 9 |
| `src/app/(app)/samples/[id]/_components/SampleDetailClient.tsx` | 2, 5 |
| `src/app/(app)/samples/_components/SamplesClient.tsx` | 4 |
| `functions/src/index.ts` | 1, 8 |
| `src/app/globals.css` | 7 |

---

## Promemoria trasversali

- La **Cloud Function** (`functions/`) non è nel `npm run build`, non è nel deploy Vercel e non è
  nella CI. Dopo ogni modifica lì dentro: `npm --prefix functions run build` e
  `firebase deploy --only functions`.
- Le convenzioni facili da sbagliare — `ActionResult` solo per le scritture, soft delete **non**
  uniforme (i campioni non hanno `deletedAt`), `zTimestamp` non esiste, bracket notation,
  centesimi interi, `dueAt` e non `dueDate`, niente `undefined` con l'Admin SDK, letture prima
  delle scritture in transazione — sono in
  [`appunti-cliente-2026-09-20.md` §5](./appunti-cliente-2026-09-20.md).
- I test coprono **solo funzioni pure**. Dove un modulo chiede un test, la logica va estratta in
  `src/lib/calc/` o `src/lib/utils/` e testata lì.

---

## Registro

Una riga per modulo completato.

| Data | # | Modulo | Esito | Note per chi viene dopo |
|------|---|--------|-------|-------------------------|
| 2026-09-20 | 1 | Fix fuso orario nelle notifiche | ✅ Fatto | `functions/` non aveva `node_modules` installati in locale: serve `npm install` dentro `functions/` prima di poterlo buildare. Aggiunta `const TZ = "Europe/Rome"` in cima a `functions/src/index.ts`, `timeZone: TZ` su tutte le formattazioni data/ora coinvolte (righe 108, 275, 823, 956) e in `src/app/api/costs/reminders/route.ts` (import da `@/lib/utils/date`). Verificato con script Node ad-hoc: 09:00 corretto sia in CEST che CET, e le 00:30 CET mostrano il giorno giusto. **⚠️ Manca ancora il deploy manuale**: `npm --prefix functions run build && firebase deploy --only functions` non eseguito in questa sessione — il fix è nel repo ma non in produzione finché non si esegue. |
| 2026-09-20 | 2 | Frecce campioni dopo il completamento | ✅ Fatto | Aggiunta `getFirstInProgressSampleId(excludeId)` in `src/server/actions/samples.ts` (stessa query/ordinamento delle frecce, ritorno diretto non `ActionResult`, nessun filtro `deletedAt`). `handleTransition` in `SampleDetailClient.tsx` ora, solo per `to === "completed"`, chiama quella action e fa `router.replace` sul risultato o resta con `router.refresh()` se `null`. Verificato end-to-end con Playwright installato ad-hoc (non nel repo) contro dev server + emulatori Firebase locali (mai avviati prima in questa sessione — serviva `npm run emulators` + `npm run seed`): con 4 campioni seed in lavorazione, completandoli in sequenza si passa sempre al successivo, l'ultimo mostra il messaggio "nessun altro campione" e resta in pagina, e il tasto indietro dopo la navigazione automatica non torna al campione appena completato (confermato che `router.replace` non lascia una entry di history separata). Non testato lo swipe iPad (codice non toccato da questo modulo, invariato). |
| 2026-09-20 | 3 | Clienti: liste separate aziende e privati | ✅ Fatto | `/clients/aziende` e `/clients/privati` come da documento; `/clients` è ora solo un redirect. `ClientsClient` prende `type` come prop, filtra su `c.type`, colonne dinamiche (rimossa la colonna "Tipo" ridondante dato che ogni lista è ormai omogenea; aggiunta una colonna "Telefono" che prima non esisteva in tabella, solo in CSV — il documento la elencava esplicitamente per entrambi i tipi). `ClientForm` ha una nuova prop opzionale `defaultType` (default `"business"`, invariato per l'uso da `/clients/[id]`). Sistemati anche due punti non citati esplicitamente nel documento ma toccati dalla stessa causa: `ClientDetailHeader.tsx` (breadcrumb "Clienti" e redirect dopo archiviazione) ora punta alla lista giusta in base a `client.type`, altrimenti dopo l'archiviazione di un privato si finiva reindirizzati su `/clients/aziende`. `revalidatePath("/clients", "layout")` applicato a tutti e 5 i call site indicati dal documento. Verificato con Playwright: redirect, filtro corretto (2 aziende / 1 privato sui 4 clienti seed, 1 azienda archiviata esclusa di default), colonne e placeholder di ricerca per tipo, form che apre già sul tipo della pagina corrente, creazione visibile nella lista senza reload — **incluso lo scenario esplicito del documento** (creare un cliente su una lista e vederlo apparire sull'altra lista raggiunta con **navigazione soft** via Link di sidebar, non full reload: senza il fix `"layout"` sarebbe rimasta con dati stantii dalla Router Cache di Next.js). |
| 2026-09-21 | 4 | Riepilogo analisi per categoria | ✅ Fatto | Implementato esattamente come da documento: funzione pura `groupInProgressAnalysesByCategory` in `src/lib/calc/samples-summary.ts` (+ 6 test: conteggio per analisi non per campione, categoria mancante/vuota, grafie diverse unificate, analisi non più nel catalogo → "Senza categoria" senza crash, ordinamento). Nuova Server Action `getInProgressAnalysesSummary()` in `samples.ts` — un solo `where("status", "==", "in_progress")`, nessun filtro `deletedAt` (i campioni non hanno quel campo), catalogo via `getAnalyses({ includeArchived: true })`. Nuovo componente `AnalysesSummaryCards.tsx`, montato in `SamplesClient.tsx` sopra i filtri; card = `KpiCard` avvolta in `<button>`, popup con `Dialog` + `ScrollArea` (componente esistente in `components/ui/` ma non ancora usato altrove nel repo). Verificato a schermo con Playwright installato ad-hoc (non nel repo, come nel modulo 2) contro emulatori + `npm run seed`: 2 card ("Chimica base": 6 su 3 campioni, "Sicurezza alimentare": 1 su 1 campione) coerenti coi 4 campioni in lavorazione del seed; click apre il popup con intestazione per campione + righe analisi e badge "In attesa"/"Risultato inserito"; link dal popup naviga correttamente a `/samples/{id}`; a 390px di larghezza (iPhone) griglia a 2 colonne, zero scroll orizzontale (`scrollWidth === clientWidth`); nessun errore in console. Non testato a schermo il caso "Senza categoria" (nessuna analisi seed ne è priva) né il cambio di pagina/filtro tabella — entrambi coperti solo dai test della funzione pura / dal fatto che i conteggi vengono da una query indipendente da `getSamples()`. |
