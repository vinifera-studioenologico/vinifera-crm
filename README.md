# Vinifera CRM

Gestionale iPad-first per laboratori di analisi enologica. Gestisce clienti, campioni, analisi, preventivi, referti, pacchetti, pagamenti, promemoria e statistiche.

**Stack:** Next.js 16 (App Router) · TypeScript · Firebase (Firestore + Storage + Auth) · Tailwind CSS v4 · shadcn/ui

---

## Prerequisiti

- Node.js ≥ 20
- Account Firebase con progetto attivo
- Account Vercel (deploy)
- Account Resend (email — opzionale)
- Bot Telegram (notifiche — opzionale)

---

## Setup locale

### 1. Clona e installa

```bash
git clone <repo-url>
cd vinifera
npm install
```

### 2. Variabili d'ambiente

```bash
cp .env.local.example .env.local
```

Compila `.env.local` con i valori del progetto Firebase (vedi sezione **Variabili** sotto).

### 3. Firebase — configurazione progetto

Nel [Firebase Console](https://console.firebase.google.com):

1. **Authentication** → abilita provider *Email/Password*
2. **Firestore** → crea database in modalità *produzione*, regione `europe-west1`
3. **Storage** → crea bucket, regione `europe-west1`
4. **Firestore Rules** → copia il contenuto di `firestore.rules` e pubblica
5. **Storage Rules** → copia il contenuto di `storage.rules` e pubblica

### 4. Account di servizio (Admin SDK)

1. Firebase Console → **Impostazioni progetto** → **Account di servizio**
2. Clicca *Genera nuova chiave privata* → scarica il JSON
3. Copia i valori in `.env.local`:
   - `FIREBASE_ADMIN_PROJECT_ID` = campo `project_id`
   - `FIREBASE_ADMIN_CLIENT_EMAIL` = campo `client_email`
   - `FIREBASE_ADMIN_PRIVATE_KEY` = campo `private_key` (mantieni i `\n` letterali)

### 5. Primo utente admin

L'app richiede il custom claim `role: "admin"` su Firebase Auth:

1. Firebase Console → **Authentication** → crea manualmente il primo utente (email + password)
2. Copia l'**UID** dell'utente
3. Apri **Firebase Console → Firestore** e crea il documento `settings/company` (può essere vuoto per ora)
4. Per impostare il claim admin, usa la Firebase CLI o l'Admin SDK:

```js
// seed-admin.mjs — esegui con: node seed-admin.mjs
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const UID = "INCOLLA_UID_QUI";

initializeApp({ credential: cert("./service-account.json") });
await getAuth().setCustomUserClaims(UID, { role: "admin" });
console.log("Fatto! Fai logout e login di nuovo nell'app.");
```

```bash
node seed-admin.mjs
```

### 6. Avvia in locale

```bash
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000) e accedi con le credenziali dell'utente admin.

---

## Variabili d'ambiente

| Variabile | Descrizione |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | Config client SDK (da Firebase → Impostazioni progetto → App web) |
| `FIREBASE_ADMIN_PROJECT_ID` | ID progetto Firebase |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Email account di servizio |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Chiave privata account di servizio (con `\n` letterali) |
| `RESEND_API_KEY` | API key Resend per email transazionali |
| `RESEND_FROM_EMAIL` | Mittente email es. `Vinifera <noreply@dominio.it>` |
| `TELEGRAM_BOT_TOKEN` | Token bot Telegram (da @BotFather) |
| `TELEGRAM_CHAT_ID` | ID chat/gruppo Telegram per le notifiche |
| `NOTIFY_EMAIL` | Email destinatario notifiche promemoria |
| `CRON_SECRET` | Segreto cron — Vercel lo invia come `Authorization: Bearer` |
| `NEXT_PUBLIC_DEV_BYPASS_AUTH` | `true` per saltare il login in locale (solo dev) |

---

## Deploy su Vercel

### 1. Collega il repository

1. [vercel.com/new](https://vercel.com/new) → importa il repository Git
2. Framework: **Next.js** (rilevato automaticamente)
3. Root directory: `.` (default)

### 2. Variabili d'ambiente

In **Project → Settings → Environment Variables** aggiungi tutte le variabili di `.env.local.example` con i valori reali.

> **`FIREBASE_ADMIN_PRIVATE_KEY`**: incolla la chiave esattamente come appare nel JSON scaricato (con i `\n` letterali). Vercel la gestisce correttamente senza modifiche.

### 3. Cron Jobs

`vercel.json` configura automaticamente il cron ogni 15 minuti:

```
/api/reminders/cron  →  */15 * * * *
```

Il cron è protetto da `CRON_SECRET`. Vercel lo invia come `Authorization: Bearer <CRON_SECRET>` — nessuna configurazione aggiuntiva necessaria.

### 4. Deploy

```bash
git push origin main
```

Vercel esegue il build e pubblica automaticamente ad ogni push su `main`.

---

## Script utili

```bash
npm run dev          # sviluppo locale (http://localhost:3000)
npm run build        # build di produzione
npm run lint         # ESLint
npm run typecheck    # TypeScript check
```

---

## Struttura del progetto

```
src/
├── app/
│   ├── (app)/          # area autenticata (sidebar + topbar)
│   │   ├── clients/    # clienti + tab analisi, campioni, ecc.
│   │   ├── samples/    # campioni
│   │   ├── quotes/     # preventivi
│   │   ├── reports/    # referti
│   │   ├── payments/   # pagamenti
│   │   ├── reminders/  # promemoria
│   │   ├── stats/      # statistiche e grafici
│   │   └── settings/   # impostazioni azienda + notifiche
│   ├── (auth)/         # pagina login
│   ├── api/            # route API (PDF, cron)
│   └── page.tsx        # landing pubblica
├── components/
│   ├── forms/          # form React Hook Form + Zod
│   ├── pdf/            # documenti PDF (@react-pdf/renderer)
│   └── ui/             # componenti shadcn/ui
├── lib/
│   ├── firebase/       # client.ts + admin.ts
│   └── utils/          # money, date, calc
├── schemas/            # schemi Zod + tipi TypeScript
└── server/
    └── actions/        # Server Actions (Firebase Admin)
firestore.rules         # regole sicurezza Firestore
storage.rules           # regole sicurezza Storage
vercel.json             # configurazione cron Vercel
```
