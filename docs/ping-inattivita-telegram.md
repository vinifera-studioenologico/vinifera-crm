# Ping Telegram su schermata analisi inattiva — documento di sviluppo

> **Obiettivo**: se la schermata di inserimento risultati resta aperta un'ora senza che nessuno
> tocchi niente, arriva un promemoria su Telegram.
>
> **Stato**: da implementare. **Fonte**: appunti cliente 20/09/2026, punto #9.

---

## 1. Richiesta del cliente

> *"Aggiungere un ping su Telegram quando c'è la schermata di inserimento analisi aperta ma non
> tocchi niente per 1h e rimane lì, ti scrive."*

Il caso reale: si apre un campione per inserire i risultati, si viene interrotti, il tablet resta
lì aperto e il campione non viene chiuso.

---

## 2. Stato attuale

**Non esiste una schermata dedicata "inserimento analisi".** L'inserimento risultati è una
sezione dentro il dettaglio campione: `src/app/(app)/samples/[id]/_components/SampleDetailClient.tsx:673-768`.
È un componente `"use client"` con `useState` semplice
(`results: Record<analysisId, string>`, `:99-103`), **senza autosave**: il salvataggio è esplicito
col pulsante "Salva risultati" (`:660-668` → `handleSaveResults` `:306-320` → `saveSampleResults`).
Gli input sono abilitati quando lo stato è `in_progress` o `completed` (`:676`).

**Non esiste alcun rilevamento di inattività** in tutto `src/`.

**Telegram**: oggi ogni chiamante rifà la fetch a mano. `src/` non ha un helper condiviso. I
punti di riferimento per le credenziali sono:

- `src/server/actions/settings.ts:261-305` — `loadNotificationConfig` / `sendTestTelegram`
- `src/app/api/costs/reminders/route.ts:150-154` — lettura **Firestore-first con fallback env**:

  ```ts
  const telegramToken = (notifData["telegramBotToken"] as string) || process.env.TELEGRAM_BOT_TOKEN || "";
  const telegramChatId = (notifData["telegramChatId"] as string) || process.env.TELEGRAM_CHAT_ID || "";
  ```

  e l'invio a `:161-173`, che controlla `res.ok`. Lo schema è `NotificationSettingsSchema`
  (`src/schemas/settings.ts:4-9`).

---

## 3. Decisioni tecniche

1. **Timer lato client, invio lato server.** Il conteggio dell'inattività può stare solo nel
   browser: nessun job schedulato può sapere che una pagina è aperta e ferma. Il server espone
   una route che il client chiama quando l'ora è scaduta.
2. **Nessun job schedulato, nessuna scrittura su Firestore.** La Cloud Function `checkReminders`
   e i cron Vercel non c'entrano: aggiungerci uno stato "ultima interazione" significherebbe
   scrivere su Firestore a ogni tocco. Non va fatto.
3. **Si attiva solo dove ha senso**: campione in stato `in_progress`, cioè quando la sezione
   risultati è realmente operativa. Su un campione completato o annullato il ping non parte.
4. **Una sola notifica per apertura di pagina.** Non si ripete ogni ora: se l'operatore ignora il
   primo messaggio, altri cinque non aiutano. Chiudendo e riaprendo la pagina il conteggio
   riparte.
5. Si crea **un helper Telegram condiviso** (`src/lib/notifications/telegram.ts`) perché questo è
   il quarto call site e non ne esiste uno. **I call site esistenti non vanno migrati**
   in questa sessione: funzionano, e toccarli allarga il lavoro senza motivo.

---

## 4. Implementazione

### 4.1 Helper — `src/lib/notifications/telegram.ts` (nuovo)

Prima riga `import "server-only";` (legge la config da `adminDb`).

```ts
export async function sendTelegramMessage(text: string): Promise<boolean>
```

- legge il documento `settings/notifications`, con fallback su `process.env.TELEGRAM_BOT_TOKEN` /
  `TELEGRAM_CHAT_ID`, **con la stessa precedenza Firestore-first** di
  `src/app/api/costs/reminders/route.ts:150-154`;
- se token o chat id mancano → ritorna `false` senza lanciare (è la convenzione già usata
  altrove: una notifica non configurata non deve rompere il flusso chiamante);
- POST a `https://api.telegram.org/bot{token}/sendMessage` con
  `{ chat_id, text, parse_mode: "HTML" }`;
- controlla `res.ok` e ritorna l'esito.

### 4.2 Route — `src/app/api/notifications/idle/route.ts` (nuova)

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
```

- `POST`, con `await requireAdmin()` come prima istruzione (401 altrimenti). È una route
  autenticata dalla sessione admin, **non** un endpoint pubblico né un cron: niente `CRON_SECRET`.
- body validato con uno schema Zod inline: `{ sampleId: string, sampleCode: string,
  clientName: string }`.
- compone il messaggio e chiama `sendTelegramMessage`. Formato proposto:

  ```
  ⏳ <b>Campione fermo da 1 ora</b>
  C-2026-0001 — Azienda Agricola Rossi
  La schermata di inserimento risultati è aperta ma non viene toccata.
  ```

  Se serve il link diretto, comporlo dall'origine della richiesta
  (`new URL(req.url).origin` + `/samples/{sampleId}`): non esiste in questo repo una variabile
  d'ambiente con l'URL pubblico del CRM (`SITE_URL` è l'URL del **sito**, non del gestionale, e
  non va riusata qui).
- risponde `{ ok: true }` anche quando Telegram non è configurato: il client non deve mostrare
  errori all'operatore per una notifica di servizio.

### 4.3 Hook — `src/hooks/use-idle-ping.ts` (nuovo)

```ts
export function useIdlePing(opts: { enabled: boolean; idleMs: number; onIdle: () => void }): void
```

- parte solo se `enabled`;
- un `setTimeout` a `idleMs`, azzerato a ogni interazione: ascoltare su `window` gli eventi
  `pointerdown`, `keydown`, `wheel`, `touchstart` (passive listener);
- per non rifare il timer a ogni singolo evento, riarmarlo al massimo una volta ogni ~30s
  (tenere in un ref il timestamp dell'ultimo riarmo);
- **una sola chiamata a `onIdle` per montaggio**, tramite un ref booleano;
- pulizia completa di timer e listener nel cleanup dell'effetto.

Nota: se il dispositivo va in sospensione il timeout scatterà al risveglio, in ritardo. È il
comportamento voluto — la schermata era effettivamente rimasta lì.

### 4.4 Aggancio — `SampleDetailClient.tsx`

Nel componente, accanto allo stato dei risultati:

```ts
useIdlePing({
  enabled: sample.status === "in_progress",
  idleMs: 60 * 60 * 1000,
  onIdle: () => { /* fetch POST /api/notifications/idle, errori ignorati */ },
});
```

La `fetch` è fire-and-forget con `.catch(() => {})`: un ping fallito non deve produrre né toast
né errori in console visibili all'operatore.

---

## 5. Criteri di accettazione

- [ ] Aprendo un campione **in lavorazione** e non toccando nulla, dopo un'ora arriva un
      messaggio Telegram che identifica il campione (codice + cliente).
      *Per la verifica, abbassare temporaneamente `idleMs` a ~20 secondi e rimetterlo a un'ora
      prima di chiudere il lavoro.*
- [ ] Toccando qualcosa (tap, tasto, scroll) il conteggio riparte da zero: interagendo ogni tanto
      per più di un'ora non arriva nessun messaggio.
- [ ] Arriva **un solo** messaggio per apertura di pagina, non uno ogni ora.
- [ ] Su un campione `completed`, `pending` o `cancelled` non parte nessun ping.
- [ ] Uscendo dalla pagina prima della scadenza il ping non parte (timer ripulito).
- [ ] Con Telegram non configurato in `settings/notifications` e senza variabili d'ambiente,
      la route risponde `200` e l'app non mostra errori.
- [ ] Chiamando `POST /api/notifications/idle` senza sessione admin si riceve `401`.
- [ ] `npm run check` verde.
