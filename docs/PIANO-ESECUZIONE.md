# Piano di esecuzione — lavori da appunti cliente 20/09/2026

> **Questo è il file di tracciamento.** Ogni sessione che completa un modulo **aggiorna la riga
> corrispondente qui dentro**, così non si perde il filo fra una sessione e l'altra.
>
> Contesto e punti aperti: [`appunti-cliente-2026-09-20.md`](./appunti-cliente-2026-09-20.md).

---

## Istruzioni per la sessione che esegue un modulo

1. Si lavora su **un solo modulo per sessione**. Il prompt di apertura è:
   `Esegui docs/<nome-documento>.md`
2. Si segue **esclusivamente** quel documento. Se qualcosa non torna o è ambiguo, **si segnala e
   ci si ferma** — non si reinterpreta e non si allarga il lavoro ad altri moduli.
3. A lavoro finito: **`npm run check`** deve essere verde (typecheck + lint + test + build).
4. I criteri di accettazione del documento vanno verificati **davvero**, non dati per buoni.
   Dove il documento dice "verificare a schermo", va avviato `npm run dev` e guardato.
5. **Prima di chiudere la sessione**: tornare qui e aggiornare la riga del modulo — stato, data,
   e nella colonna Note tutto ciò che chi viene dopo deve sapere (scelte fatte, cose rimaste
   fuori, sorprese trovate nel codice).

Legenda stato: `⬜ da fare` · `🟡 in corso` · `✅ fatto` · `⛔ bloccato`

---

## Fase 1 — Quick win (nessun prerequisito, si parte da qui)

Lavori piccoli, isolati, che non dipendono da risposte del cliente. Portano risultato subito e
non si pestano i piedi a vicenda.

| # | Stato | Modulo | Documento | Note |
|---|-------|--------|-----------|------|
| 1 | ⬜ | Fix fuso orario notifiche | [`fix-timezone-notifiche.md`](./fix-timezone-notifiche.md) | ⚠️ Richiede deploy manuale della Cloud Function, non basta il merge |
| 2 | ⬜ | Frecce campioni dopo il completamento | [`fix-navigazione-campioni.md`](./fix-navigazione-campioni.md) | |
| 3 | ⬜ | Clienti: liste aziende e privati | [`clienti-aziende-privati.md`](./clienti-aziende-privati.md) | Tocca Sidebar/MobileNav/⌘K — vedi conflitti sotto |

## Fase 2 — Feature sull'operatività quotidiana

Il valore più alto per chi usa il gestionale tutti i giorni. Ancora nessuna dipendenza dal cliente.

| # | Stato | Modulo | Documento | Note |
|---|-------|--------|-----------|------|
| 4 | ⬜ | Riepilogo analisi per categoria | [`riepilogo-analisi-per-categoria.md`](./riepilogo-analisi-per-categoria.md) | Fare **prima** del #5: tocca la lista campioni, il #5 il dettaglio |
| 5 | ⬜ | Ping Telegram su inattività | [`ping-inattivita-telegram.md`](./ping-inattivita-telegram.md) | |
| 6 | ⬜ | Incasso multiplo di più rate | [`pagamenti-multipli.md`](./pagamenti-multipli.md) | |

## Fase 3 — Richiede una risposta dal cliente

**Non iniziare** questi moduli prima di aver ottenuto la risposta indicata: si rischia di
buttare il lavoro.

| # | Stato | Modulo | Documento | Cosa serve prima |
|---|-------|--------|-----------|------------------|
| 7 | ⬜ | Tema verde biliardo | [`tema-verde-biliardo.md`](./tema-verde-biliardo.md) | Quale tonalità. Si implementa la **variante A**, gli si mostra a video, e si conferma o si passa alla B (6 valori da cambiare) |
| 8 | ⬜ | Statistiche: spese, incassi, audit | [`statistiche-spese-e-incassi.md`](./statistiche-spese-e-incassi.md) | **(a)** elenco definitivo delle sottocategorie di spesa · **(b)** *quali numeri* gli sembravano sbagliati |
| 9 | ⬜ | Modulo Obiettivi | [`modulo-obiettivi.md`](./modulo-obiettivi.md) | Quali metriche vuole come obiettivo annuale |

> Il #7 si può comunque **iniziare** senza risposta: la variante A è fatta apposta per essere
> mostrata. I #8 e #9 no — senza risposta si costruisce sulla sabbia.

## Fase 4 — Il modulo grosso

| # | Stato | Modulo | Documento | Note |
|---|-------|--------|-----------|------|
| 10 | ⬜ | Assistente AI | [`assistente-ai.md`](./assistente-ai.md) | Per ultimo: interroga trasversalmente tutti i dati, meglio che gli altri lavori siano già dentro. Aggiunge la dipendenza `@anthropic-ai/sdk` |

---

## Perché quest'ordine

- **Le cose piccole prima**: tre lavori chiusi in poche ore danno subito qualcosa da mostrare al
  cliente e verificano che il flusso "un documento → una sessione" funzioni.
- **Il fuso orario per primo** perché è l'unico bug che il cliente *subisce* ogni giorno, e
  perché è l'unico che richiede un deploy separato: meglio scoprire subito se quel passaggio dà
  problemi, non alla fine sotto pressione.
- **Le modifiche di schema tardi**: il #8 aggiunge il campo `subcategory` alle spese. Più si
  aspetta, più spese si accumulano senza quel campo — ma anticiparlo senza la tassonomia
  confermata è peggio. Da sbloccare col cliente **presto**, da eseguire dopo.
- **L'assistente AI per ultimo** perché legge tutto: ogni modulo chiuso prima è una cosa in più
  che l'assistente sa raccontare, senza doverci tornare sopra.

---

## Conflitti fra moduli — attenzione se si lavora in parallelo

| File | Moduli che lo toccano |
|------|----------------------|
| `src/components/app-shell/Sidebar.tsx` | #3 (clienti), #9 (obiettivi) |
| `src/components/app-shell/MobileNav.tsx` | #3, #9 |
| `src/components/app-shell/Topbar.tsx` (`COMMAND_NAV`) | #3, #9 |
| `src/app/(app)/samples/_components/SamplesClient.tsx` | #4 |
| `src/app/(app)/samples/[id]/_components/SampleDetailClient.tsx` | #2, #5 |
| `functions/src/index.ts` | #1 (formattazione date), #8 (eredità sottocategoria) |
| `src/app/globals.css` | #7 |

Se si procede in sequenza — come consigliato — non è un problema. Se si aprono branch paralleli,
tenere #3 e #9 separati nel tempo.

---

## Promemoria trasversali

- La **Cloud Function** (`functions/`) non è nel `npm run build`, non è nel deploy Vercel e non è
  nella CI. Dopo ogni modifica lì dentro:
  ```bash
  npm --prefix functions run build
  firebase deploy --only functions
  ```
- Le convenzioni facili da sbagliare (bracket notation, centesimi interi, `dueAt` e non
  `dueDate`, niente `undefined` con l'Admin SDK, letture prima delle scritture in transazione)
  sono in [`appunti-cliente-2026-09-20.md` §5](./appunti-cliente-2026-09-20.md).
- I test coprono **solo funzioni pure**. Dove un modulo chiede un test, la logica va estratta in
  `src/lib/calc/` o `src/lib/utils/` e testata lì.

---

## Registro

Una riga per modulo completato: chi/quando/cosa è cambiato rispetto al documento.

| Data | Modulo | Esito | Note |
|------|--------|-------|------|
| | | | |
