# Fix fuso orario nelle notifiche — documento di sviluppo

> **Obiettivo**: le date e gli orari nelle notifiche Telegram/email devono essere sempre resi in
> ora italiana (`Europe/Rome`), non nel fuso del container che li genera.
>
> **Stato**: da implementare. **Fonte**: appunti cliente 20/09/2026, punto #1.

---

## 1. Richiesta del cliente

> *"I promemoria su Telegram hanno il date time senza zona quindi è sfasato in base al timezone."*

Un promemoria impostato per le 09:00 arriva su Telegram scritto "07:00" (in estate) o "08:00"
(in inverno).

---

## 2. Diagnosi — il dato salvato è corretto, sbagliata è la formattazione

Il valore su Firestore **non è il problema**. In `src/server/actions/reminders.ts:94` e `:139`
la scadenza viene scritta come:

```ts
dueAt: Timestamp.fromDate(fromZonedTime(data.dueAt, TZ))
```

cioè l'istante assoluto è già giusto (`TZ = "Europe/Rome"` da `src/lib/utils/date.ts:17`).

Il bug è **a valle**, nella Cloud Function che compone il testo della notifica —
`functions/src/index.ts:265-272`:

```ts
const dueAt = (d["dueAt"] as Timestamp).toDate();
const dueDateStr = dueAt.toLocaleDateString("it-IT", {
  day: "2-digit", month: "long", year: "numeric",
  hour: "2-digit", minute: "2-digit",
});
```

Senza l'opzione `timeZone`, `toLocaleDateString` formatta nel fuso del processo, che sulle Cloud
Functions è **UTC**. Il `timeZone: "Europe/Rome"` dichiarato nello scheduler
(`functions/src/index.ts:232`) governa **quando** la function parte, non come formatta le date.

### Punti da correggere

| File | Riga | Cosa | Visibilità del bug |
|------|------|------|--------------------|
| `functions/src/index.ts` | 265-272 | `dueDateStr` del promemoria (usato a `:282` Telegram, `:294` e `:301` email) | **Alta** — è quello segnalato dal cliente: sfasa l'ora |
| `functions/src/index.ts` | 101-107 | helper `formatDateIT` (usato a `:403`, `:414`, `:421`, `:475`, `:486`, `:493`, `:601`, `:611`, `:618`) | Bassa — è solo data, ma a cavallo di mezzanotte mostra il giorno sbagliato |
| `functions/src/index.ts` | 951 | `nextStartsAt.toLocaleDateString("it-IT", {...})` inline, nuova istanza evento ricorrente | Bassa, stesso motivo |
| `functions/src/index.ts` | 817 | `startsAtDate.toLocaleDateString(isIt ? "it-IT" : "en-GB", {...})`, data evento bilingue | Bassa, stesso motivo — **non dimenticarlo**: è l'unico fuori dal flusso promemoria |
| `src/app/api/costs/reminders/route.ts` | 117-120 | `firstOfNextMonth.toLocaleDateString("it-IT", { month, year })` | Molto bassa (mese/anno), ma stessa classe di bug |

Non vanno toccati: `formatCents` (`:110`) usa `toLocaleString` per la valuta, non per le date; e i
`timeZone: "Europe/Rome"` a `:232` e `:650` sono la configurazione degli scheduler, già corretta.

---

## 3. Decisioni tecniche

1. **Nessuna nuova dipendenza.** `functions/package.json` non ha `date-fns` né `date-fns-tz`
   (contiene solo `firebase-admin`, `firebase-functions`, `resend`, `stripe`) e non serve
   aggiungerli: basta passare `timeZone` alle opzioni di `Intl`, che è già disponibile nel
   runtime Node.
2. **Non importare da `src/`**: `functions/` è un deployable separato con il proprio
   `tsconfig`/`package.json`. La costante `TZ` va ridefinita localmente lì dentro.
3. Per un valore che include ora e minuti si usa **`toLocaleString`**, non
   `toLocaleDateString` (che per contratto formatta una data; con `hour`/`minute` funziona, ma è
   il metodo sbagliato e rende il codice ambiguo da leggere).

---

## 4. Implementazione

### 4.1 `functions/src/index.ts` — costante condivisa

Aggiungere vicino alle altre costanti in cima al file:

```ts
const TZ = "Europe/Rome";
```

### 4.2 `functions/src/index.ts:101-107` — `formatDateIT`

Aggiungere `timeZone: TZ` alle opzioni esistenti, lasciando invariata la firma e il resto del
comportamento.

### 4.3 `functions/src/index.ts:265-272` — orario del promemoria

Sostituire con:

```ts
const dueAt = (d["dueAt"] as Timestamp).toDate();
const dueDateStr = dueAt.toLocaleString("it-IT", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TZ,
});
```

I tre call site (`:282`, `:294`, `:301`) consumano già la variabile: non vanno toccati.

### 4.4 `functions/src/index.ts:951` e `:817` — eventi

Aggiungere `timeZone: TZ` alle opzioni delle due chiamate inline (`nextStartsAt` a `:951`,
`startsAtDate` a `:817`). A `:817` il locale è variabile (`isIt ? "it-IT" : "en-GB"`): cambia la
lingua, **non** il fuso — il fuso resta `Europe/Rome` in entrambi i casi.

### 4.5 `src/app/api/costs/reminders/route.ts:117-120`

Aggiungere `timeZone: TZ` importando la costante già esistente:

```ts
import { TZ } from "@/lib/utils/date";
```

(verificare che sia esportata da lì — lo è, `src/lib/utils/date.ts:17`).

### 4.6 Build e deploy — passaggio manuale, non dimenticarlo

La Cloud Function **non** viene deployata da Vercel né dalla CI:

```bash
npm --prefix functions run build
firebase deploy --only functions
```

Senza questi due comandi la correzione non arriva in produzione, anche se il repo è a posto.

---

## 5. Criteri di accettazione

- [ ] Un promemoria con scadenza **09:00 ora italiana** arriva su Telegram con scritto `09:00`.
- [ ] Vale sia in **ora legale** (CEST, UTC+2) che in **ora solare** (CET, UTC+1): la correzione
      non deve essere un offset fisso, ma la reale conversione di fuso.
- [ ] La stessa data appare identica nella mail e nel messaggio Telegram dello stesso promemoria.
- [ ] Una scadenza alle **00:30 ora italiana** mostra il giorno giusto, non quello precedente.
- [ ] Nessuna occorrenza residua di `toLocaleDateString(` o `toLocaleString(` priva di `timeZone`
      in `functions/src/index.ts` e in `src/app/api/costs/reminders/route.ts`
      (verificabile con una ricerca testuale sui due file).
- [ ] `npm --prefix functions run build` completa senza errori.
- [ ] `npm run check` verde.

---

## 6. Note

Il resto dell'app (lato Next.js) formatta già correttamente tramite
`src/lib/utils/date.ts:60-67`, che usa `format(toZonedTime(d, TZ), ...)` con `date-fns-tz`.
Quel percorso non è toccato da questo lavoro: il bug è confinato ai due file elencati in §2.
