# Appunti cliente — 20 settembre 2026

> **Fonte**: incontro in sede presso il cliente. Questo documento raccoglie i punti emersi,
> li traduce in lavori tecnici e li smista su **10 documenti di sviluppo esecutivi**, uno per
> modulo, ciascuno autosufficiente.
>
> **Stato**: nessun punto ancora implementato.
> **Data**: 20 settembre 2026.

---

## 1. Come usare questi documenti

Il flusso previsto è **una sessione Claude Code dedicata per ogni documento della tabella §2**.
Dentro quella sessione:

1. Si legge **esclusivamente** il documento di quel modulo (più `CLAUDE.md` / `AGENTS.md`, che
   sono già nel contesto di progetto). Non serve leggere gli altri moduli.
2. Si implementa seguendo i passi del documento.
3. Si chiude con `npm run check` (typecheck + lint + test + build) **verde**.

I documenti sono scritti per essere eseguiti senza reinterpretazioni: dove una decisione era
davvero ambigua non è stata inventata una risposta, è stata segnalata in §4 di questo documento
e nella sezione "Punti aperti" del modulo interessato.

---

## 2. Indice dei lavori

| # | Punto raccolto | Documento | Tipo | Peso |
|---|----------------|-----------|------|------|
| 1 | Promemoria Telegram con orario sfasato (manca il fuso) | [`fix-timezone-notifiche.md`](./fix-timezone-notifiche.md) | Bugfix | XS |
| 2 | Sfondo light verde biliardo invece di bianco/panna | [`tema-verde-biliardo.md`](./tema-verde-biliardo.md) | Restyling | XS |
| 3 | Frecce campioni: completando uno si resta bloccati | [`fix-navigazione-campioni.md`](./fix-navigazione-campioni.md) | Bugfix UX | S |
| 4 | Clienti divisi in due pagine: aziende e privati | [`clienti-aziende-privati.md`](./clienti-aziende-privati.md) | Feature | S |
| 5 | Pagamenti multi-selezione con incasso e nota unici | [`pagamenti-multipli.md`](./pagamenti-multipli.md) | Feature | M |
| 6 | Card di riepilogo analisi in corso per categoria | [`riepilogo-analisi-per-categoria.md`](./riepilogo-analisi-per-categoria.md) | Feature | M |
| 7 | Statistiche: spese per categoria + incassi per metodo + audit dati | [`statistiche-spese-e-incassi.md`](./statistiche-spese-e-incassi.md) | Feature + audit | L |
| 8 | Modulo Obiettivi annuali con riepilogo in dashboard | [`modulo-obiettivi.md`](./modulo-obiettivi.md) | Feature greenfield | L |
| 9 | Ping Telegram se la schermata analisi resta ferma 1h | [`ping-inattivita-telegram.md`](./ping-inattivita-telegram.md) | Feature | S |
| 10 | Assistente AI sul gestionale, con link navigabili | [`assistente-ai.md`](./assistente-ai.md) | Feature greenfield | XL |

---

## 3. Ordine di esecuzione consigliato

L'ordine è pensato per portare a casa presto le cose piccole e visibili, e per affrontare i due
moduli greenfield quando il resto del codice è già assestato.

1. **#1 timezone** e **#2 tema** — indipendenti, si chiudono in poco, si vedono subito.
2. **#3 frecce campioni** — bugfix isolato sul dettaglio campione.
3. **#4 clienti aziende/privati** — tocca routing e sidebar, meglio farlo prima degli altri lavori UI.
4. **#6 riepilogo analisi** e **#9 ping inattività** — entrambi sull'area campioni. Se si fanno
   in due sessioni separate, fare prima #6: tocca la pagina lista, #9 tocca il dettaglio.
5. **#5 pagamenti multipli** — indipendente.
6. **#7 statistiche** — include l'aggiunta delle sottocategorie di spesa, che è una modifica di
   schema: va fatta prima che si accumulino altre spese.
7. **#8 obiettivi** — greenfield, tocca dashboard e sidebar.
8. **#10 assistente AI** — per ultimo: interroga trasversalmente tutti i dati del CRM, conviene
   che gli altri lavori siano già dentro.

**Conflitti attesi fra moduli** (se si lavora su branch paralleli):

- #4 e #8 toccano entrambi `src/components/app-shell/Sidebar.tsx` e `MobileNav.tsx`.
- #6 e #9 toccano entrambi l'area campioni ma file diversi (lista vs dettaglio).
- #2 e #10 toccano entrambi `src/app/globals.css` solo se la chat aggiunge token propri — il
  documento #10 è scritto per non aggiungerne.

---

## 4. Punti aperti — da confermare col cliente

Nessuno di questi blocca l'inizio dei lavori: per ognuno il documento di modulo propone una
soluzione concreta e già implementabile. Vanno però validati, perché sono scelte di prodotto
che dagli appunti non si deducono con certezza.

| # | Modulo | Domanda | Cosa è stato proposto intanto |
|---|--------|---------|-------------------------------|
| A | #2 tema | "Verde biliardo" significa sfondo pagina **verde chiaro salvia** (leggibile, card chiare sopra) o **verde feltro pieno** più saturo? | Variante chiara come default, variante satura pronta nello stesso documento: si cambiano 6 valori di token |
| B | #8 obiettivi | Quali metriche si vogliono come obiettivo annuale? | Tre metriche: fatturato incassato, numero campioni accettati, numero nuovi clienti — tutte opzionali, il modello è pensato per aggiungerne altre con una riga |
| C | #7 statistiche | L'elenco esatto delle sottocategorie di spesa (acqua/luce/immondizia sotto utenze, affitto, ecc.) | Tassonomia iniziale proposta nel documento, definita in una sola costante per poterla correggere in un minuto |
| D | #7 statistiche | "Verificare validità dei dati": **quali numeri** sono sembrati sbagliati al cliente? | In assenza della risposta il documento contiene un audit completo e mirato: sono già stati individuati tre punti a rischio reale (vedi §5 di quel documento) |
| E | #5 pagamenti | La multi-selezione serve sulla schermata **rate del cliente** (dove oggi si segna pagato) o sulla lista pagamenti globale? | Implementata sulle rate del cliente: è l'unica schermata dove oggi esiste l'azione "segna pagato" |
| F | #6 campioni | "Analisi in corso" = tutte le analisi dei campioni in lavorazione, o solo quelle **senza risultato inserito**? | Contate tutte le analisi dei campioni in lavorazione; nel popup ogni riga mostra comunque se il risultato è già stato inserito |

---

## 5. Convenzioni valide per tutti i moduli

Sono già documentate in `CLAUDE.md` e, con più dettaglio operativo, in
[`crediti-da-preventivo.md` §3](./crediti-da-preventivo.md). Le più facili da sbagliare:

- Ogni Server Action inizia con `"use server";` poi `import "server-only";`, e chiama
  `requireAdmin()` come prima istruzione.
- **`ActionResult<T>` è il ritorno delle scritture, non delle letture.** Le letture restituiscono
  il valore diretto: `getSample` → `SampleDoc | null`, `getSamples` → `PaginatedResult<SampleDoc>`,
  `getAdjacentInProgressSamples` → oggetto semplice. Le mutazioni (`markInstallmentPaid`,
  `updatePayment`…) ritornano `ActionResult`.
- **Il soft delete non è uniforme, controllare prima di filtrare.** Hanno `deletedAt`: clienti,
  analisi, spese, costi fissi, kit. **I campioni no**: `SampleDocSchema`
  (`src/schemas/sample.ts:99-122`) usa `status: "cancelled"` + `cancelledAt`. Una
  `where("deletedAt", "==", null)` su documenti privi del campo restituisce **zero risultati**,
  senza errori — è un bug silenzioso.
- **Non esiste `zTimestamp`.** I campi Timestamp negli schemi si dichiarano `z.any()` con
  commento. In `src/schemas/validators.ts` ci sono `zCents`, `zEurInput`, `zEmail`, `zPhone`,
  `zVatNumber`, `zTaxCode`, `zIBAN`, `zSdiCode`, `zZip`, `zAddress`.
- Campi Firestore in **bracket notation**: `data["clientId"]`, mai `data.clientId`.
- Tutti gli importi sono **interi in centesimi**. Mai aritmetica su euro decimali.
- Le rate si scrivono con il campo **`dueAt`**, non `dueDate` (lo schema dichiara `dueDate`, ma
  tutti i writer e tutte le query usano `dueAt`; il reader accetta entrambi per i dati legacy).
- L'Admin SDK **rifiuta i campi `undefined`**: omettere la chiave oppure scrivere `null`.
- In una transazione Firestore: **tutte le letture prima di tutte le scritture**.
- Schemi Zod in `src/schemas/`, riesportati da `index.ts` (eccezione nota: `lead.ts`).
- I test coprono **solo funzioni pure** (`lib/calc/*`, `lib/utils/*`, `*-logic.test.ts`): non
  esistono test che colpiscono Firestore. Quindi la logica va estratta in funzioni pure e
  testata lì.
- UX vincolante (PROJECT_SPEC.md §17): niente tab orizzontali per contenuti sequenziali,
  Drawer/Sheet per i form rapidi, Dialog solo per conferme critiche, icone `lucide-react`
  stroke 1.75, righe tabella `h-14`, colori badge di stato già mappati — riusarli.

**Attenzione al deploy**: la Cloud Function `checkReminders` (`functions/src/index.ts`) è un
**deployable separato**, non incluso in `npm run build` né nel deploy Vercel né nella CI. Se un
modulo la tocca (#1 e potenzialmente #9), va ricostruita e deployata a mano:

```bash
npm --prefix functions run build
firebase deploy --only functions
```

---

## 6. Appunti originali

Trascrizione fedele di quanto raccolto, per riferimento. Ogni voce rimanda al modulo che la copre.

1. *"Pagamenti da spuntare multipli (rendilo selezionabili e fai pagamento unico per tutti),
   magari note uniche per tutti"* → #5
2. *"Sezione commerciale > statistiche: verificare validità dei dati; campioni per stato, riusare
   il grafico per metterci le spese divise per categorie (fornitori, utenze (acqua e luce e
   immondizia)). Aggiungere subcategorie tipo affitto, bolla fornitore ecc. per fare grafici a
   torta. Per crearle usa le spese già esistenti. Al click va in una pagina con i grafici a
   torta. Altro grafico per capire quanto incassa con bonifico o contante"* → #7
3. *"Dentro clienti separare in due pagine aziende e privati. Concettualmente rimane uguale ma
   saranno due liste separate"* → #4
4. *"Inserire il modulo 'Obiettivi' con sezione apposita e riepilogo in dashboard. Annuali che
   scadono a fine anno e si resettano ogni anno; ogni anno finché non li setti te li richiede"* → #8
5. *"I promemoria su Telegram hanno il date time senza zona quindi è sfasato in base al
   timezone"* → #1
6. *"Sfondo light del CRM, invece di bianco/giallino panna deve essere verde biliardo"* → #2
7. *"Mettere chat AI. Limitare solo allo scope del gestionale. Deve gestire tutto, link compresi
   quando cita qualcosa, così che si possa cliccare all'analisi o quello che è"*
   — precisazione successiva: *"deve essere un assistente, l'utente chiede info di ogni genere
   inerenti al CRM: clienti, analisi, pagamenti ecc. Tutto in pratica. Se chiede di analisi mega
   specifiche deve fornire link di navigazione a quella analisi o a quel pagamento o tutto ciò
   che può generare un link presente sul CRM"* → #10
8. *"Frecce per passare da uno in lavorazione all'altro: quando ne completi uno rimani
   concettualmente bloccato perché diventa completato e spariscono le frecce. Soluzione: quando
   ne completi uno ti porta automaticamente sulla prima in lavorazione"* → #3
9. *"Aggiungere sezione di riepilogo sulla sezione campioni: card di riepilogo una per ogni
   categoria di analisi, con il totale delle analisi in corso di quella categoria. Al click un
   popup con ogni riga il nome del campione e sotto le analisi che quel campione ha per quella
   categoria"* → #6
10. *"Aggiungere un ping su Telegram quando c'è la schermata di inserimento analisi aperta ma non
    tocchi niente per 1h e rimane lì"* → #9
