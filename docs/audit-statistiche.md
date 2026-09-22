# Audit statistiche — validità dei dati

> **Contesto**: Parte B (§5) di [`statistiche-spese-e-incassi.md`](./statistiche-spese-e-incassi.md).
> Il cliente ha chiesto di "verificare validità dei dati" senza indicare quali numeri gli
> sembrassero sbagliati (punto aperto D di quel documento, ancora senza risposta). Questo audit
> copre quindi i 6 punti già individuati leggendo il codice, non un'indagine mirata su un numero
> specifico segnalato dal cliente.
>
> **Metodo**: lettura del codice per capire il meccanismo, poi verifica quantitativa sul database
> reale (progetto Firebase `vinifera-studioenologico`) con uno script di **sola lettura**,
> [`scripts/audit-statistiche.ts`](../scripts/audit-statistiche.ts) (nessuna scrittura eseguita —
> rieseguibile in futuro per ricontrollare gli stessi punti). Eseguito il 2026-09-22.
>
> **Nessun numero è stato corretto in questo audit.** Dove emerge un problema, la correzione è
> proposta ma non applicata: va fatta nel modulo a cui appartiene il codice (in molti casi la
> Parte C dello stesso documento, che resta bloccata sulla tassonomia sottocategorie).

---

## 1. `dueDate` vs `dueAt`

**Rischio ipotizzato**: lo schema dichiara `dueDate`, i writer attuali scrivono `dueAt`, ma cron e
statistiche interrogano solo `dueAt` — rate scritte col solo `dueDate` (es. da vecchi script)
sarebbero invisibili a scaduto/statistiche.

**Verificato su**: tutte le 176 rate (`collectionGroup("installments")`) in produzione.

**Esito: ✅ Nessun problema.**

| Solo `dueAt` | Solo `dueDate` (legacy) | Entrambi | Nessuno dei due |
|---|---|---|---|
| 176 | 0 | 0 | 0 |

Tutte le rate esistenti hanno `dueAt`. Il rischio è reale nel codice (`payments.ts:52-55` gestisce
esplicitamente il fallback "per compatibilità con dati legacy"), ma non si è mai concretizzato: non
esistono, ad oggi, dati che ne sarebbero affetti. Nessuna correzione necessaria. Il fallback nel
codice può restare com'è, a costo zero, come rete di sicurezza.

---

## 2. `paidAmountCents ?? amountCents` — rate pagate senza importo registrato

**Rischio ipotizzato**: `getMonthlyStats` (`stats.ts:202-215`) conta una rata `paid` senza
`paidAmountCents` per l'intero `amountCents`, sovrastimando l'incassato — in particolare per gli
acconti "rata 0" di `createManualPayment`, che storicamente potevano non scrivere questo campo.

**Verificato su**: le 83 rate con `status === "paid"` in produzione.

**Esito: ✅ Nessun problema.**

| Rate pagate | ...senza `paidAmountCents` | di cui acconti (index 0) | di cui altre rate |
|---|---|---|---|
| 83 | 0 | 0 | 0 |

Tutte le rate pagate hanno `paidAmountCents` valorizzato. Il fallback `?? amountCents` in
`getMonthlyStats`/`getDashboardStats` non sta oggi alterando nessun numero. Corretto lasciarlo: è
una difesa contro dati incompleti, non un bug in sé — semplicemente non serve ancora.

---

## 3. Doppio conteggio dei costi fissi

**Rischio ipotizzato**: `getCostsSummary` fa il pro-rata mensile dei costi fissi attivi *e* la
Cloud Function genera una spesa reale `costExpenses` (categoria `fixed_cost`) alla scadenza —
possibile doppio conteggio nello stesso totale.

**Verificato su**: le 26 spese non cancellate in produzione, di cui 4 di categoria `fixed_cost`.

**Esito: ✅ Nessun problema — già gestito correttamente nel codice.**

`getCostsSummary` (`costs.ts:630-633`) esclude esplicitamente `category === "fixed_cost"` dal
calcolo di `totalExpensesCents`, con un commento che ne spiega il motivo. Le 4 spese `fixed_cost`
trovate in produzione hanno tutte un `fixedCostRef` valorizzato (generate dall'automatismo, non
inserite a mano) — coerente con l'esclusione, che quindi si applica correttamente a tutte.

**Attenzione non bloccante, per la Parte C**: la tabella spese (`ExpensesTable.tsx:216`) mostra
invece un totale che **include** anche le spese `fixed_cost` (somma di tutte le righe filtrate,
senza l'esclusione che ha `getCostsSummary`). È corretto che lo faccia — è "il totale di quello che
vedi in tabella" — ma è anche esattamente il tipo di disallineamento che genera la sensazione "i
dati non tornano": il totale della dashboard costi e il totale a fondo tabella spese non
coincideranno mai per costruzione, quando ci sono spese `fixed_cost`. Non è un bug da correggere
qui (comportamento voluto in entrambi i punti), ma vale la pena, quando si lavora alla Parte C,
aggiungere una nota a video vicino a uno dei due totali (es. "esclude i costi fissi, già contati a
parte") così che chi guarda non si preoccupi inutilmente.

---

## 4. Soft delete — filtri `deletedAt` nelle aggregazioni

**Rischio ipotizzato**: una query di aggregazione che non filtra `deletedAt == null` continua a
contare entità cancellate.

**Verificato su**: lettura di tutte le query di `stats.ts` e `costs.ts` usate nelle aggregazioni, più
conteggio reale di rate aperte appartenenti a clienti archiviati.

**Esito: ⚠️ Un punto strutturalmente debole, senza impatto reale oggi.**

Le entità che *hanno* il campo `deletedAt` sono filtrate correttamente ovunque vengano aggregate:
`clients`, `quotes`, `costExpenses`, `costFixedCosts`, `costKits`, `analyses` — tutte le query in
`getDashboardStats`/`getCostsSummary` hanno il `.where("deletedAt", "==", null)`. I `samples` e i
`clientPackages` non hanno quel campo per disegno (si annullano via `status`, non si cancellano) —
corretto non filtrarli.

Il punto debole è **`payments`**: lo schema (`PaymentDoc.deletedAt`) e il mapper (`toPaymentDoc`)
prevedono il campo, ma **non esiste nessuna azione che lo scriva** — non c'è un "elimina
pagamento", solo `cancelPayment` (che imposta `status: "cancelled"`, non `deletedAt`). Il campo è
quindi morto: dichiarato ma mai popolato.

La conseguenza pratica riguarda però un altro collegamento, più concreto: **archiviare un cliente
(`archiveClient`) non tocca i suoi pagamenti/rate**. Le query `collectionGroup("installments")` di
`getDashboardStats`/`getMonthlyStats` sommano quindi anche le rate pending/overdue di clienti
archiviati, perché Firestore non permette un "join" per escluderle a livello di query.

| Clienti archiviati (`deletedAt != null`) | Rate "pending" residue di questi clienti | Rate "overdue" residue |
|---|---|---|
| 9 | 0 (0,00 €) | 0 (0,00 €) |

Nei dati reali **oggi non c'è impatto**: i 9 clienti archiviati non hanno rate aperte residue (o
sono stati saldati/annullati prima dell'archiviazione, o i pagamenti si sono chiusi con lo stesso
`cancelPayment`). Ma è un rischio latente reale: se in futuro si archivia un cliente che ha ancora
rate pending/overdue, quei numeri continueranno a comparire in "Attesi 90gg" e "In ritardo" sulla
dashboard, mentre il cliente stesso sparisce da "Clienti attivi" — un disallineamento visibile e
proprio il tipo di cosa che genera la percezione "i dati non tornano". **Proposta, non applicata in
questo audit**: quando si archivia un cliente con pagamenti non chiusi, o annullare le rate aperte
allo stesso modo di `cancelPayment`, o mostrare un avviso esplicito in UI ("questo cliente ha rate
aperte per X €, archiviarlo comunque?").

---

## 5. Confini di mese/anno: fuso del server (UTC) vs `Europe/Rome`

**Rischio ipotizzato**: le aggregazioni per mese usano `new Date(y, m, d)` e `.getMonth()` nativi,
che dipendono dal fuso del processo Node — UTC su Vercel, dove non è impostato nessun `TZ` (stessa
classe di bug del modulo #1, già corretto lì per le notifiche, ma non qui).

**Verificato su**: confronto, per ogni timestamp reale, fra il mese "vero" (calcolato in
`Europe/Rome`, come lo percepisce chi usa il gestionale) e il mese che il codice attuale calcola
(nativo/UTC) — sulle 83 rate pagate e sui 279 campioni in produzione.

**Esito: ⚠️ Bug reale nel codice, confermato dalla lettura — ma zero casi attualmente disallineati
nei dati esistenti.**

| Dato | Timestamp confrontati | Mesi disallineati oggi |
|---|---|---|
| `installments.paidAt` (rate pagate) | 83 | 0 |
| `samples.createdAt` | 279 | 0 |

Il meccanismo è reale ma si comporta diversamente a seconda del dato:

- **`installments.paidAt`** è quasi sempre scritto tramite `civilDateToEndOfDay()`
  (`markInstallmentPaid`, `markInstallmentsPaidBulk`, e l'acconto di `createManualPayment` quando
  viene passata una data): per costruzione è **fine giornata Europe/Rome** (23:59:59.999 locale),
  che in UTC cade sempre nello stesso giorno di calendario (21:59 o 22:59 UTC a seconda dell'ora
  legale/solare, mai oltre mezzanotte). Il raggruppamento nativo per mese, su questo campo
  specifico, **non sbaglia mai**, non per una protezione esplicita nel codice ma per un effetto
  collaterale fortunato di come viene scritta la data. L'unica eccezione è l'acconto **senza** data
  esplicita: lì `createManualPayment` (`payments.ts:562-564`) usa `Timestamp.now()`, un timestamp
  reale non ancorato a fine giornata — quello sì è esposto al disallineamento.
- **`samples.createdAt`** è un `FieldValue.serverTimestamp()` puro — il momento esatto in cui il
  campione viene registrato, senza nessun ancoraggio. `getSamplesByMonth` lo raggruppa con
  `.getMonth()` nativo: un campione registrato, ad esempio, alle 00:20 del 1° del mese ora italiana
  (23:20 UTC del giorno prima, stesso mese solo se non è anche cambio di mese) **verrebbe contato
  nel mese sbagliato** sul grafico "Campioni per stato". Zero casi nei dati attuali semplicemente
  perché, per coincidenza, nessun campione è stato finora registrato in quella finestra oraria a
  cavallo di un cambio di mese — non perché il codice sia protetto.

**Proposta, non applicata in questo audit** (stesso pattern già usato nel modulo #1 e in
`src/lib/utils/date.ts`): in `getSamplesByMonth`, raggruppare usando `toZonedTime(date, TZ)` invece
di `.getMonth()` nativo; in `createManualPayment`, usare `civilDateToEndOfDay(new
Date().toISOString().slice(0,10))` (o l'equivalente esplicito "oggi in Europe/Rome") invece di
`Timestamp.now()` quando l'acconto non ha una data esplicita, per coerenza con tutte le altre
scritture di `paidAt`/`dueAt`. Entrambe le modifiche sono localizzate e a basso rischio, ma toccano
`stats.ts` e `payments.ts` — fuori dallo scope di sola lettura di questo audit; da fare quando si
lavora alla Parte C (grafici) dello stesso documento, o come modulo a sé se si preferisce
sbloccarlo prima.

---

## 6. `version` sui pagamenti — concorrenza ottimistica inerte

**Rischio ipotizzato**: `markInstallmentPaid` incrementa `version` senza mai leggerlo né
confrontarlo con un valore atteso.

**Verificato**: lettura del codice (non richiede query sui dati). Confermato in tutte e quattro le
funzioni di scrittura di `payments.ts` — `markInstallmentPaid`, `markInstallmentsPaidBulk`,
`updateInstallment`, `cancelInstallment` fanno tutte `version: FieldValue.increment(1)` senza mai
leggere il `version` corrente né riceverlo come parametro atteso dal client.

**Esito: confermato, per decisione esplicita del documento non risolto in questo audit.**

Non è un bug di statistica (non altera nessun numero mostrato), è un'assenza di protezione: due
sessioni che modificano lo stesso pagamento in parallelo non vengono rilevate come conflitto — la
race condition è mitigata solo dall'atomicità della transazione Firestore sui singoli campi
coinvolti (che evita corruzione dei dati), non da un vero controllo ottimistico sulla versione. Il
modulo #6 (incasso multiplo) ha già verificato che le transazioni concorrenti sulle *rate* non
corrompono i dati (una rata già pagata viene scartata, non sovrascritta). Il `version` resta quindi
un campo scritto ma senza uno scopo funzionante oggi. Segnalato come da richiesta del documento,
nessuna correzione proposta qui.

---

## Riepilogo

| # | Punto | Esito | Correzione proposta |
|---|---|---|---|
| 1 | `dueDate` vs `dueAt` | ✅ Nessun dato legacy trovato | Nessuna — il fallback esistente basta |
| 2 | `paidAmountCents` mancante | ✅ Nessuna rata pagata ne è priva | Nessuna |
| 3 | Doppio conteggio costi fissi | ✅ Già escluso correttamente nel codice | Nota UI in Parte C sul totale spese vs dashboard |
| 4 | Soft delete | ⚠️ Rischio latente, 0 casi reali oggi | Bloccare/segnalare rate aperte all'archiviazione cliente |
| 5 | Confini mese UTC vs Rome | ⚠️ Bug reale nel codice, 0 casi reali oggi | `getSamplesByMonth` con `toZonedTime`; acconto senza data con data civile invece di `Timestamp.now()` |
| 6 | `version` su payments | ⚠️ Confermato, per scelta non risolto | — (esplicitamente fuori scope) |

**In sintesi per chi userà questi numeri**: le statistiche mostrate oggi in produzione **sono
corrette** — nessuno dei rischi ipotizzati ha prodotto una distorsione reale nei dati esistenti. I
punti 4 e 5 sono difetti veri nel codice, non ancora manifestati per come sono stati usati finora i
dati, che vale la pena sistemare prima che lo diventino (non perché un numero attuale sia sbagliato).
