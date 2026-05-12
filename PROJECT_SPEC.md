# Vinifera CRM — Specifica Tecnica & Roadmap di Implementazione

> Documento operativo per l'AI coding assistant (Claude Sonnet) e per gli sviluppatori.
> Lo scopo è costruire end-to-end un gestionale **iPad-first** per un laboratorio di analisi vini.
> Ogni step è atomico e verificabile.

---

## 0. Indice

1. [Visione & Obiettivi](#1-visione--obiettivi)
2. [Stack Tecnologico](#2-stack-tecnologico)
3. [Architettura Generale](#3-architettura-generale)
4. [Modello Dati (Firestore)](#4-modello-dati-firestore)
5. [Security Rules & Auth](#5-security-rules--auth)
6. [Struttura del Progetto Next.js](#6-struttura-del-progetto-nextjs)
7. [Design System & UX](#7-design-system--ux)
8. [Specifica per Modulo](#8-specifica-per-modulo)
9. [Generazione PDF](#9-generazione-pdf)
10. [Notifiche (Telegram + Resend)](#10-notifiche-telegram--resend)
11. [Dashboard & Aggregazioni](#11-dashboard--aggregazioni)
12. [Roadmap Step-by-Step](#12-roadmap-step-by-step)
13. [Convenzioni di Codice](#13-convenzioni-di-codice)
14. [Deploy & CI/CD](#14-deploy--cicd)
15. [Checklist Finale](#15-checklist-finale-pre-lancio)
16. [Edge Cases, Gap & Decisioni Aperte](#16-edge-cases-gap--decisioni-aperte)
17. [Linee Guida UX Moderne (vincolanti)](#17-linee-guida-ux-moderne-vincolanti)
18. [Hardening Anti-Bug Logici (regole tecniche vincolanti)](#18-hardening-anti-bug-logici-regole-tecniche-vincolanti)

---

## 1. Visione & Obiettivi

**Vinifera CRM** è un gestionale interno per un laboratorio di analisi enologiche. L'utente target è il personale dell'azienda (admin singolo per la v1) che gestisce:

- Anagrafica clienti (P.IVA + Privati)
- Listino analisi
- Pacchetti prepagati di analisi
- Campioni in lavorazione (richieste di analisi)
- Preventivi (con generazione PDF)
- Referti (PDF aggregato di N campioni di un cliente)
- Pagamenti (anche rateizzati) con scadenze
- Promemoria con notifiche Telegram + Email
- Dashboard con KPI

**Non è in scope v1:** fatturazione elettronica SDI, multi-tenant, accesso clienti, ruoli multipli.

**Principi UX (vincolanti, vedi anche §17):**
- **iPad-first** per il CRM (tablet in laboratorio/ufficio).
- **Mobile-first** per la landing page pubblica.
- Touch targets ≥ 44px, gesture-friendly, sidebar collassabile.
- Tutte le tabelle devono avere fallback "card view" su mobile.
- **Design moderno, pulito, gerarchico**: niente accozzaglie di tab, niente densità eccessiva, niente UI "da gestionale anni 2000". L'occhio vuole la sua parte: spazio bianco, tipografia curata, micro-interazioni discrete, palette sobria. **Ogni schermata deve avere uno scopo chiaro e una azione primaria evidente.**

---

## 2. Stack Tecnologico

| Layer | Tecnologia | Versione minima |
|---|---|---|
| Framework | Next.js (App Router) | 15.x |
| Linguaggio | TypeScript | 5.x (strict) |
| Styling | Tailwind CSS | 4.x |
| UI Kit | shadcn/ui | latest |
| Auth | Firebase Auth | 11.x |
| DB | Firestore | 11.x |
| Storage | Firebase Storage | 11.x |
| Server SDK | firebase-admin | 13.x |
| Forms | react-hook-form + zod | latest |
| Data fetching | @tanstack/react-query | 5.x |
| Tabelle | @tanstack/react-table | 8.x |
| Date | date-fns | 4.x |
| PDF | @react-pdf/renderer | 4.x |
| Email | Resend | latest |
| Telegram | grammy o fetch nativo Bot API | latest |
| Hosting | Vercel | — |
| Icons | lucide-react | latest |

**Pacchetti opzionali utili:**
- `sonner` per toast
- `cmdk` (incluso shadcn) per command palette
- `recharts` per grafici dashboard
- `nuqs` per query state typesafe

---

## 3. Architettura Generale

```
┌──────────────────────────────────────────────────────────┐
│  Browser (iPad/Desktop/Mobile)                            │
│  ┌────────────────────────────────────────────────────┐   │
│  │ Next.js App Router (RSC + Client Components)       │   │
│  │  - UI shadcn/ui                                    │   │
│  │  - Firebase Client SDK (Auth state, realtime)      │   │
│  │  - React Query (cache letture)                     │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
                  │                 │
                  │ HTTPS           │ Firebase SDK
                  ▼                 ▼
┌─────────────────────────┐   ┌──────────────────────────┐
│ Next.js Server          │   │  Firebase                 │
│  - Route Handlers (API) │   │   - Auth                  │
│  - Server Actions       │   │   - Firestore             │
│  - PDF generation       │──▶│   - Storage               │
│  - Telegram/Resend      │   │                           │
│  - firebase-admin       │   │                           │
└─────────────────────────┘   └──────────────────────────┘
                  │
                  ▼
            ┌──────────┐  ┌───────────┐
            │ Resend   │  │ Telegram  │
            └──────────┘  └───────────┘
```

**Pattern letture:** sempre via Firebase Client SDK + React Query (offre realtime e cache).
**Pattern scritture critiche:** via Server Action / Route Handler + firebase-admin (per consistenza, transazioni, generazione PDF, notifiche).
**Letture pubbliche/landing:** statiche (SSG).

---

## 4. Modello Dati (Firestore)

> Convenzione: tutti i documenti hanno `id`, `createdAt`, `updatedAt` (Timestamp). Soft delete via `deletedAt: Timestamp | null`.

### 4.1 Collection `settings/company`

Documento singleton con dati aziendali per PDF, email, branding.

```ts
{
  id: "company",
  legalName: string,
  displayName: string,
  vatNumber: string,        // P.IVA
  taxCode: string,          // C.F.
  address: { street, city, zip, province, country },
  email: string,
  phone: string,
  pec?: string,
  iban?: string,
  bankName?: string,
  logoUrl?: string,         // su Firebase Storage
  defaultEnpaiaPercent: number,  // default 4
  defaultVatPercent: number,     // default 22
  defaultEnpaiaApplied: boolean, // default true
  pdfFooterNote?: string,
  updatedAt: Timestamp,
}
```

### 4.2 Collection `users`

```ts
{
  id: string,            // = uid Firebase Auth
  email: string,
  displayName: string,
  role: "admin",         // v1: solo admin
  telegramChatId?: string,
  notificationPrefs: {
    email: boolean,
    telegram: boolean,
  },
  createdAt, updatedAt,
}
```

### 4.3 Collection `clients`

```ts
{
  id: string,
  type: "business" | "individual",
  // OBBLIGATORI MINIMI (validati da zod):
  displayName: string,    // ragione sociale o "Nome Cognome"
  email: string,
  phone: string,

  // BUSINESS
  vatNumber?: string,
  sdiCode?: string,
  pec?: string,

  // INDIVIDUAL
  firstName?: string,
  lastName?: string,
  taxCode?: string,

  // OPZIONALI (per pre-compilazione)
  address?: { street, city, zip, province, country },
  billingAddress?: { ... },
  notes?: string,
  tags?: string[],

  // Aggregati denormalizzati (mantenuti via Server Action)
  stats: {
    activePackagesCount: number,
    remainingAnalyses: number,   // somma delle analisi residue dei pacchetti attivi
    totalRevenue: number,         // somma pagamenti incassati
    pendingAmount: number,        // somma pagamenti pendenti
    overdueAmount: number,
    samplesPending: number,       // campioni non ancora "completed"
  },

  createdAt, updatedAt, deletedAt,
}
```

### 4.4 Collection `analyses` (listino)

```ts
{
  id: string,
  code: string,            // es. "AN-001", univoco
  name: string,            // es. "Solforosa libera"
  category?: string,       // es. "Chimica base", "Microbiologia"
  description?: string,
  defaultPrice: number,    // EUR
  unit?: string,           // es. "mg/L"
  active: boolean,
  createdAt, updatedAt, deletedAt,
}
```

### 4.5 Collection `packages` (listino pacchetti)

> Modello "template" del pacchetto (es. "Pacchetto 100 analisi - 800€").

```ts
{
  id: string,
  name: string,
  description?: string,
  totalAnalyses: number,    // N analisi incluse
  price: number,            // prezzo del pacchetto
  active: boolean,
  createdAt, updatedAt, deletedAt,
}
```

### 4.6 Collection `clientPackages` (istanze pacchetto su cliente)

```ts
{
  id: string,
  clientId: string,
  packageId: string,        // riferimento al template
  packageNameSnapshot: string,
  totalAnalyses: number,    // snapshot
  remainingAnalyses: number,
  price: number,            // snapshot
  status: "active" | "exhausted" | "cancelled",
  paymentId?: string,       // collegato al pagamento creato
  purchasedAt: Timestamp,
  cancelledAt?: Timestamp,
  cancelReason?: string,
  createdAt, updatedAt,
}
```

**Logica di consumo:** quando un campione (vedi 4.7) ha analisi con `coveredByPackageId`, alla creazione del campione si decrementa `remainingAnalyses` del pacchetto in transazione. Se 0, status diventa `exhausted`.

### 4.7 Collection `samples` (campioni / richieste analisi)

```ts
{
  id: string,
  code: string,             // progressivo es. "C-2026-0001"
  clientId: string,
  clientNameSnapshot: string,
  sampleName: string,       // es. "Vino rosso lotto 12"
  receivedAt: Timestamp,
  status: "pending" | "in_progress" | "completed" | "cancelled",

  items: Array<{
    analysisId: string,
    analysisCodeSnapshot: string,
    analysisNameSnapshot: string,
    unitPrice: number,           // override consentito
    coveredByPackageId?: string, // se coperto da pacchetto
    chargeAnyway: boolean,        // anche se coperto, addebita comunque
    result?: string,              // valore opzionale per referto
  }>,

  // Calcolati (denormalizzati)
  estimatedTotal: number,        // somma effettiva da pagare (esclusi i coperti senza chargeAnyway)
  paymentId?: string,            // pagamento collegato (se generato)

  notes?: string,
  cancelledAt?: Timestamp,
  cancelReason?: string,
  createdAt, updatedAt,
}
```

### 4.8 Collection `quotes` (preventivi)

```ts
{
  id: string,
  number: string,           // "2026/0001"
  year: number,
  sequence: number,
  clientId: string,
  clientSnapshot: { ...dati cliente al momento... },
  status: "draft" | "pending_approval" | "approved" | "rejected" | "cancelled",
  issuedAt: Timestamp,
  validUntil?: Timestamp,

  items: Array<
    | { kind: "free", description: string, quantity: number, unitPrice: number }
    | { kind: "analysis", analysisId: string, nameSnapshot: string, quantity: number, unitPrice: number }
    | { kind: "package", packageId: string, nameSnapshot: string, quantity: number, unitPrice: number }
  >,

  // Riepilogo
  subtotal: number,
  discounts: Array<{ label: string, type: "percent"|"fixed", value: number }>,
  taxes: Array<{ label: string, percent: number, applied: boolean }>,
  // default precompilati: [{ label: "Enpaia", percent: 4, applied: true }, { label: "IVA", percent: 22, applied: false }]
  total: number,

  notes?: string,
  pdfStorageRef?: string,        // path su Storage (rigenerato a ogni save)
  approvedAt?: Timestamp,
  approvedBy?: string,
  createdAt, updatedAt,
}
```

**Regole di stato:**
- `approved`, `rejected`, `cancelled` → immutabili (read-only), si può solo riscaricare PDF.
- transizioni consentite: `draft → pending_approval → approved | rejected | cancelled`, `draft → cancelled`.

### 4.9 Collection `reports` (referti)

> Il referto è un **PDF aggregato** di N campioni di uno stesso cliente, generato on-demand. Salviamo il record per storico/riscarico.

```ts
{
  id: string,
  number: string,            // "R-2026-0001"
  clientId: string,
  clientSnapshot: {...},
  sampleIds: string[],       // i campioni inclusi
  generatedAt: Timestamp,
  pdfStorageRef: string,
  notes?: string,
  createdAt, updatedAt,
}
```

### 4.10 Collection `payments`

```ts
{
  id: string,
  clientId: string,
  source: { kind: "sample" | "package" | "manual", refId?: string },
  description: string,
  totalAmount: number,
  paidAmount: number,         // somma transazioni "paid"
  status: "pending" | "partial" | "paid" | "overdue" | "cancelled",
  // overdue è derivato: se almeno una rata è scaduta e non pagata
  installmentsCount: number,  // 1 se non rateizzato
  createdAt, updatedAt, deletedAt,
}
```

#### Subcollection `payments/{id}/installments`

```ts
{
  id: string,
  index: number,            // 1..N
  dueDate: Timestamp,
  amount: number,
  status: "pending" | "paid" | "overdue" | "cancelled",
  paidAt?: Timestamp,
  paidAmount?: number,       // per pagamenti parziali (raro)
  method?: "cash" | "bank_transfer" | "card" | "other",
  note?: string,
  createdAt, updatedAt,
}
```

#### Subcollection `payments/{id}/transactions` (log immutabile)

```ts
{
  id: string,
  installmentId?: string,
  type: "payment" | "refund" | "adjustment" | "cancellation",
  amount: number,
  date: Timestamp,
  method?: string,
  note?: string,
  performedBy: string,       // uid
  createdAt: Timestamp,
}
```

### 4.11 Collection `reminders`

```ts
{
  id: string,
  title: string,
  description?: string,
  dueAt: Timestamp,
  relatedTo?: { kind: "client"|"sample"|"quote"|"payment", id: string },
  status: "pending" | "done" | "snoozed" | "cancelled",
  remindBeforeMinutes?: number,   // anticipo notifica (es. 60 = 1h prima)
  notifyChannels: { telegram: boolean, email: boolean },
  notifiedAt?: Timestamp,
  doneAt?: Timestamp,
  createdAt, updatedAt,
}
```

### 4.12 Collection `counters` (per numerazioni progressive)

```ts
// docId esempio: "quotes_2026", "samples_2026", "reports_2026"
{
  id: string,
  current: number,
  updatedAt: Timestamp,
}
```

Incremento via **transazione Firestore** dentro Server Action.

### 4.13 Collection `dashboardStats` (cache aggregata, opzionale)

Documento singleton aggiornato via Server Action ad ogni mutazione rilevante. In alternativa calcolo on-demand con Promise.all.

---

## 5. Security Rules & Auth

### 5.1 Auth

- **v1:** Email/password Firebase Auth.
- Pulsante "Bypass login" presente solo in sviluppo (env `NEXT_PUBLIC_DEV_BYPASS_AUTH=true`) — in prod il bypass è disabilitato.
- Account creati manualmente dall'admin via Firebase Console.
- Custom claim `role: "admin"` settato manualmente o via script `scripts/set-admin.ts` con firebase-admin.

### 5.2 Firestore Rules (esempio)

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuthed()  { return request.auth != null; }
    function isAdmin()   { return isAuthed() && request.auth.token.role == "admin"; }

    match /{document=**} {
      allow read, write: if isAdmin();
    }
  }
}
```

### 5.3 Storage Rules

```js
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.token.role == "admin";
    }
  }
}
```

### 5.4 Server-side

- API route + Server Action verificano sempre l'ID token con `firebase-admin.auth().verifyIdToken(token)` e check del custom claim.
- Helper `requireAdmin()` in `src/server/auth.ts`.

---

## 6. Struttura del Progetto Next.js

```
vinifera/
├── .env.local.example
├── .gitignore
├── README.md
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json                    # shadcn config
├── package.json
├── firestore.rules
├── storage.rules
├── firebase.json
├── scripts/
│   ├── set-admin.ts                   # set custom claim
│   └── seed-listino.ts                # opzionale: seed analisi base
├── public/
│   └── ... assets statici
└── src/
    ├── app/
    │   ├── layout.tsx                 # root layout (font, providers globali)
    │   ├── globals.css
    │   ├── page.tsx                   # LANDING pubblica
    │   ├── (auth)/
    │   │   └── login/page.tsx
    │   ├── (app)/                     # Gruppo protetto
    │   │   ├── layout.tsx             # AppShell con sidebar/topbar + AuthGuard
    │   │   ├── dashboard/page.tsx
    │   │   ├── clients/
    │   │   │   ├── page.tsx
    │   │   │   ├── new/page.tsx
    │   │   │   └── [id]/
    │   │   │       ├── layout.tsx     # tab nav cliente
    │   │   │       ├── page.tsx       # dettaglio
    │   │   │       ├── payments/page.tsx
    │   │   │       ├── packages/page.tsx
    │   │   │       ├── samples/page.tsx
    │   │   │       └── quotes/page.tsx
    │   │   ├── analyses/page.tsx      # listino analisi
    │   │   ├── packages/page.tsx      # listino pacchetti
    │   │   ├── samples/
    │   │   │   ├── page.tsx
    │   │   │   └── [id]/page.tsx
    │   │   ├── quotes/
    │   │   │   ├── page.tsx
    │   │   │   └── [id]/page.tsx
    │   │   ├── reports/
    │   │   │   ├── page.tsx
    │   │   │   └── new/page.tsx       # selezione campioni → genera PDF
    │   │   ├── payments/page.tsx
    │   │   ├── reminders/page.tsx
    │   │   ├── stats/page.tsx
    │   │   └── settings/
    │   │       ├── company/page.tsx
    │   │       └── notifications/page.tsx
    │   └── api/
    │       ├── pdf/quote/[id]/route.ts
    │       ├── pdf/report/[id]/route.ts
    │       ├── reminders/cron/route.ts   # Vercel Cron
    │       └── notify/test/route.ts
    │
    ├── components/
    │   ├── ui/                        # shadcn generated
    │   ├── app-shell/
    │   │   ├── Sidebar.tsx
    │   │   ├── Topbar.tsx
    │   │   └── MobileNav.tsx
    │   ├── data-table/
    │   │   ├── DataTable.tsx
    │   │   └── ResponsiveCardList.tsx
    │   ├── forms/
    │   │   ├── ClientForm.tsx
    │   │   ├── AnalysisForm.tsx
    │   │   ├── PackageForm.tsx
    │   │   ├── SampleForm.tsx
    │   │   ├── QuoteForm.tsx
    │   │   ├── PaymentForm.tsx
    │   │   └── ReminderForm.tsx
    │   ├── pdf/
    │   │   ├── QuotePdfDocument.tsx
    │   │   ├── ReportPdfDocument.tsx
    │   │   └── shared/
    │   │       ├── PdfHeader.tsx
    │   │       ├── PdfFooter.tsx
    │   │       └── PdfSummaryPage.tsx
    │   └── widgets/                   # widget dashboard
    │       ├── KpiCard.tsx
    │       ├── RevenueChart.tsx
    │       └── RemindersCalendar.tsx
    │
    ├── lib/
    │   ├── firebase/
    │   │   ├── client.ts              # initializeApp client SDK
    │   │   └── admin.ts               # firebase-admin (server-only)
    │   ├── auth/
    │   │   ├── AuthProvider.tsx
    │   │   ├── useAuth.ts
    │   │   └── server.ts              # verify token
    │   ├── pdf/
    │   │   └── render.ts              # render React-PDF in Buffer
    │   ├── notifications/
    │   │   ├── telegram.ts
    │   │   └── resend.ts
    │   ├── utils/
    │   │   ├── currency.ts
    │   │   ├── date.ts
    │   │   └── numbers.ts             # progressivi
    │   └── react-query.tsx
    │
    ├── server/
    │   ├── actions/                   # Server Actions
    │   │   ├── clients.ts
    │   │   ├── analyses.ts
    │   │   ├── packages.ts
    │   │   ├── samples.ts
    │   │   ├── quotes.ts
    │   │   ├── reports.ts
    │   │   ├── payments.ts
    │   │   └── reminders.ts
    │   └── repositories/              # accesso DB centralizzato
    │       └── ...
    │
    ├── schemas/                       # zod schemas condivisi
    │   ├── client.ts
    │   ├── analysis.ts
    │   ├── package.ts
    │   ├── sample.ts
    │   ├── quote.ts
    │   ├── payment.ts
    │   └── reminder.ts
    │
    ├── types/                         # TS types (derivati da zod via z.infer)
    │   └── index.ts
    │
    └── hooks/
        ├── useClients.ts
        ├── useSamples.ts
        └── ...
```

---

## 7. Design System & UX

> **Riferimento normativo principale: §17 — Linee Guida UX Moderne (vincolanti).** Questa sezione contiene solo i dettagli tecnici di base; per stile, pattern, motion, no-tab philosophy, empty states, ecc. fare riferimento alla §17.

### 7.1 Tailwind / Tema

- Palette: tema **wine-inspired** ma sobrio. Suggerimento:
  - `--primary`: bordeaux (`oklch(0.35 0.12 15)` circa)
  - `--secondary`: gold sand
  - `--background`: off-white / dark mode con grigio caldo
- Dark mode supportato via `class` strategy.
- Font: **Inter** (UI) + **Fraunces** (display per landing).
- Border radius: `lg` di default.

### 7.2 Layout

- **AppShell**: sidebar fissa su iPad (width 280px) collassabile a icone.
- **Mobile (<768px)**: bottom navigation (Dashboard / Clienti / Campioni / Preventivi / Più).
- **Topbar**: search globale (cmdk), avatar admin, switch dark/light.

### 7.3 Componenti chiave shadcn da installare

```
button, input, label, form, select, dialog, sheet, dropdown-menu,
table, tabs, card, badge, separator, sonner, tooltip, popover,
calendar, command, alert, alert-dialog, checkbox, switch, textarea,
avatar, skeleton, scroll-area, breadcrumb
```

### 7.4 Pattern responsivo per le tabelle

- `DataTable` (desktop/iPad) → `ResponsiveCardList` (mobile).
- Hook `useMediaQuery("(min-width: 768px)")` per swappare.

### 7.5 Accessibilità

- Tutti i form hanno label associate.
- Focus ring visibile.
- Dialog con `aria-describedby`.

---

## 8. Specifica per Modulo

### 8.1 Landing Page (`/`)

- **Pubblica**, SSG, mobile-first.
- Sezioni: Hero, Cosa facciamo, Servizi, Contatti, footer.
- CTA centrale **"Accedi al CRM"** che porta a `/login`.
- In `/login`: form email/password + (in dev) bottone "Accedi come admin demo" che esegue `signInWithEmailAndPassword` con account dev seed; oppure direttamente bypass via flag.

### 8.2 Dashboard (`/dashboard`)

KPI Cards (riga superiore):
- **Incassi mese corrente** (somma transactions paid del mese)
- **Incassi futuri attesi** (somma installments pending non ancora scaduti, prossimi 90 gg)
- **Pagamenti in ritardo** (numero + totale)
- **Campioni da lavorare** (status `pending` + `in_progress`)
- **Preventivi in attesa di approvazione**
- **Pacchetti attivi totali**

Sezioni:
- Grafico incassi ultimi 12 mesi (`recharts` AreaChart)
- Calendario promemoria settimana (con quick-action "fatto")
- Lista ultimi 5 campioni
- Lista ultimi 5 preventivi
- Lista pagamenti in scadenza prossimi 7gg

### 8.3 Clienti (`/clients`)

- Lista con filtri: tipo (P.IVA/Privato), tag, ha pagamenti scaduti, ha pacchetti attivi.
- Search per nome/email/P.IVA.
- Bulk action: export CSV.
- Pulsante "Nuovo cliente" → form (sheet su iPad/desktop, full screen su mobile).

**Form cliente:**
- Tab "Tipo" (Business/Individual) cambia i campi obbligatori.
- Validazione zod con messaggi italiani.
- Salvataggio via Server Action `createClient`.

**Dettaglio cliente** (`/clients/[id]`):
- Layout con **left rail secondario** (NON tab orizzontali — vedi §17.3):
  - Su iPad/desktop: nav verticale a sinistra dell'area dettaglio (icona + label) con sezioni: Anagrafica, Pagamenti, Pacchetti, Campioni, Preventivi, Allegati, Attività.
  - Su mobile / iPad portrait stretto: collassa in dropdown "Sezioni" in alto.
  - Routing: ogni sezione è una sub-route (`/clients/[id]/...`), no state-only.
  - **Anagrafica** (default): form precompilato modificabile. Sezione "Statistiche rapide" in alto a destra (revenue totale, pending, pacchetti attivi, campioni in corso).
  - **Pagamenti**: tabella di tutti i pagamenti del cliente. Click su riga → drawer con dettaglio rate e transazioni. Azioni: "Segna pagato" (per rata o totale), "Annulla", "Aggiungi nota". Possibilità di registrare un pagamento manuale non collegato.
  - **Pacchetti**: lista pacchetti attivi/esauriti/annullati. Pulsante "Aggiungi pacchetto" → modal: scelta dal listino, prezzo modificabile, **opzione "Crea pagamento associato"** (se sì → form pagamento con eventuale rateizzazione). All'annullamento di un pacchetto: dialog con domanda "Cosa fare del pagamento collegato?" → opzioni: lascia invariato / segna annullato / rimborsa (crea transaction `refund`). **Modifica:** consentita solo `description` e `notes` se status `active`; `totalAnalyses` e `price` modificabili solo se `remainingAnalyses == totalAnalyses` (mai usato).
  - **Campioni**: lista campioni. Pulsante "Nuovo campione" (vedi 8.6).
  - **Preventivi**: lista preventivi. Pulsante "Nuovo preventivo" (vedi 8.7).

### 8.4 Listino Analisi (`/analyses`)

- Tabella semplice: codice, nome, categoria, prezzo default, attivo.
- CRUD completo. Soft delete.
- Filtri per categoria, search per nome/codice.
- Validazione `code` univoco.

### 8.5 Listino Pacchetti (`/packages`)

- Tabella: nome, totale analisi, prezzo, attivo.
- CRUD completo. Soft delete.

### 8.6 Campioni (`/samples` e `/clients/[id]/samples`)

**Lista:**
- Filtri: status, cliente, periodo (data ricezione).
- Colonne: codice, cliente, nome campione, ricevuto il, status, totale stimato.

**Form Nuovo Campione** (multi-step o singola pagina con sezioni):
1. **Dati base**: cliente (preselezionato se aperto da dettaglio cliente), nome campione, data ricezione (default oggi), note.
2. **Analisi richieste**: lista interattiva.
   - Pulsante "Aggiungi analisi" → combobox con search dal listino.
   - Per ogni riga:
     - prezzo unitario (precompilato dal listino, modificabile)
     - se cliente ha pacchetti attivi con `remainingAnalyses > 0` → toggle "Copri da pacchetto" (preseleziona il primo disponibile, dropdown se multipli)
     - se coperto: checkbox "Addebita comunque" (default off)
   - Calcolo automatico: prezzo riga = `coveredByPackageId && !chargeAnyway ? 0 : unitPrice`
3. **Riepilogo & pagamento**:
   - Mostra `estimatedTotal`.
   - Se > 0: scelta "Crea pagamento" (default sì). Se sì:
     - Numero rate (default 1)
     - Periodicità (mensile/15gg/custom)
     - Data prima scadenza (default = data ricezione + 30gg)
     - Anteprima rate generate
4. **Salva**: Server Action `createSample` esegue in transazione Firestore:
   - Crea il sample con `code` progressivo.
   - Decrementa `remainingAnalyses` di ciascun pacchetto coperto.
   - Se `estimatedTotal > 0` e `createPayment`, crea `payment` + `installments`.
   - Aggiorna `clients.stats`.

**Dettaglio campione**: visualizzazione + edit (se non `completed`/`cancelled`). Pulsante "Marca come completato".

### 8.7 Preventivi (`/quotes` e `/clients/[id]/quotes`)

**Lista:** filtri per status/anno, search per numero/cliente, colonne: numero, cliente, data, totale, status.

**Form Preventivo** (creabile/modificabile solo se `draft` o `pending_approval`):
- Dati base: cliente, data emissione, valido fino, note.
- **Sezione Voci** (drag-and-drop riordinabili):
  - Pulsanti "+ Campo libero", "+ Analisi", "+ Pacchetto".
  - Riga "Campo libero": descrizione, quantità, prezzo unit.
  - Riga "Analisi": combobox listino analisi (snapshot nome+prezzo), quantità, prezzo unit (modificabile).
  - Riga "Pacchetto": combobox listino pacchetti, quantità, prezzo unit (modificabile).
- **Sezione Riepilogo:**
  - `subtotal` calcolato live.
  - **Sconti**: lista add/remove (label + tipo % o fisso + valore).
  - **Tasse**: precompilate `[Enpaia 4% ✓, IVA 22% ☐]`. Aggiungibili custom.
  - `total` calcolato: `subtotal - sconti + tasse_applicate` (le tasse si applicano sequenzialmente sull'imponibile dopo sconti).
- **Note aggiuntive**: textarea (libere, finiranno nel PDF).
- **Azioni footer:**
  - Salva bozza
  - Salva e marca "In attesa di approvazione"
  - Approva (chiede conferma; status diventa immutabile)
  - Rifiuta / Annulla
  - **Scarica PDF** (anche da bozza)

### 8.8 Referti (`/reports`)

**Lista:** referti generati con filtri cliente/anno.

**Nuovo Referto** (`/reports/new`):
1. Selezione cliente.
2. Lista campioni del cliente con checkbox.
   - Filtri: per data (range), per status (default solo `completed`).
   - Pulsante "Seleziona tutti completati nell'intervallo".
3. Anteprima PDF e generazione (Server Action `generateReport`):
   - Crea record `reports` con `number` progressivo `R-YYYY-NNNN`.
   - Genera PDF, upload Storage in `reports/{id}.pdf`, salva `pdfStorageRef`.
4. Pulsante "Invia via email al cliente" → usa Resend con template.

### 8.9 Pagamenti (`/payments`)

- Vista unificata di tutti i pagamenti.
- Filtri: status (in particolare `overdue`), cliente, periodo, fonte (manuale/campione/pacchetto).
- Tabella: cliente, descrizione, totale, pagato, residuo, prossima scadenza, status.
- Click → drawer con rate + transazioni.
- Quick-action: "Segna pagato" su rata.
- Pulsante "Nuovo pagamento manuale" (per casi extra).

**Job di stato `overdue`:** una rata è `overdue` se `dueDate < oggi && status === "pending"`. Lo derivo client-side e salvo lo stato via cron giornaliero (vedi sezione 10).

### 8.10 Promemoria (`/reminders`)

- Vista a scelta: lista o calendario mensile.
- CRUD promemoria.
- Quick-add da qualsiasi entità (es. dettaglio campione → "Aggiungi promemoria collegato").
- Marca "fatto", "rimanda 1g/3g/1w".
- Notifiche: vedi sezione 10.

### 8.11 Statistiche (`/stats`)

- Estensione della dashboard, con filtri temporali (mese/trimestre/anno/custom).
- Grafici:
  - Fatturato per mese
  - Top 10 clienti per fatturato
  - Distribuzione analisi per tipologia
  - Tempo medio campione → completamento
  - % pacchetti vs ad-hoc
  - Tasso di approvazione preventivi

### 8.12 Impostazioni (`/settings/company`, `/settings/notifications`)

- **Company**: form con tutti i campi `settings/company`. Upload logo (Storage `company/logo.png`).
- **Notifications**: telegramChatId + toggle canali. Pulsante "Invia messaggio test".

---

## 9. Generazione PDF

Libreria: **`@react-pdf/renderer`** (server-side, in API route).

### 9.1 Layout comune (Preventivi & Referti)

**Pagina 1 — Header & Intestazione:**
- In alto a sinistra: logo + dati azienda (legalName, indirizzo, P.IVA, email, telefono).
- In alto a destra: numero documento, data, dati cliente (ragione sociale/nome, indirizzo, P.IVA/CF).
- Titolo grande: "Preventivo n. 2026/0001" o "Referto di analisi".

**Pagine intermedie — Voci/Analisi:**
- Tabelle ben formattate.
- Per i preventivi: una riga per item (descrizione, qty, prezzo unit, totale).
- Per i referti: per ogni campione una sezione con tabella analisi (nome, risultato/unità, eventuale prezzo se mostrato).

**Ultima pagina (sempre forzata `break`) — Riepilogo:**
- Subtotale
- Sconti (lista)
- Tasse applicate (lista)
- **Totale finale** in evidenza
- Note aggiuntive
- Spazio in fondo: a sinistra "Data e luogo: ___________", a destra "Firma cliente: ___________"
- Footer con `pdfFooterNote` e numero pagina.

### 9.2 Implementazione

```
GET /api/pdf/quote/[id]
GET /api/pdf/report/[id]
```

- Verifica auth admin.
- Carica dati da Firestore con admin SDK.
- Renderizza `<QuotePdfDocument data={...} company={...} />` con `renderToStream`.
- Risponde con `Content-Type: application/pdf`.
- Salva copia su Storage in `quotes/{id}.pdf` / `reports/{id}.pdf` per audit.

### 9.3 Componenti React-PDF

- `PdfHeader`, `PdfFooter`, `PdfSummaryPage` riutilizzabili.
- Stili centralizzati in `components/pdf/styles.ts`.
- Font custom: registrare Inter (regular/bold) via `Font.register`.

---

## 10. Notifiche (Telegram + Resend)

### 10.1 Telegram

- Bot creato via @BotFather. Token in env `TELEGRAM_BOT_TOKEN`.
- Per associare l'admin: setta manualmente `users/{uid}.telegramChatId` (oppure UI: pulsante "Avvia bot" mostra chat link, l'utente scrive `/start <code>` e webhook salva il chatId).
- Funzione helper:
  ```ts
  // lib/notifications/telegram.ts
  export async function sendTelegram(chatId: string, message: string) {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { ... });
  }
  ```

### 10.2 Resend

- API Key in env `RESEND_API_KEY`.
- Dominio verificato (configurazione DNS).
- Template React Email per:
  - Promemoria
  - Invio referto al cliente
  - Pagamento in scadenza (opzionale)

### 10.3 Cron promemoria

- **Vercel Cron** (gratuito) configurato in `vercel.json`:
  ```json
  { "crons": [{ "path": "/api/reminders/cron", "schedule": "*/15 * * * *" }] }
  ```
- Endpoint:
  - Trova reminders con `status=pending`, `dueAt - remindBeforeMinutes <= now`, `notifiedAt == null`.
  - Invia notifica sui canali abilitati.
  - Setta `notifiedAt`.
- Stesso cron (o secondario daily) calcola `installments.status = "overdue"` e aggiorna `payments.status` aggregato.

---

## 11. Dashboard & Aggregazioni

Strategia: **aggregazioni denormalizzate** mantenute via Server Action.

- `clients.stats` aggiornato a ogni mutazione di payments/samples/packages del cliente.
- `dashboardStats` documento singleton aggiornato in coda alle Server Action critiche.
- Per i grafici storici: query mirate con `where` su mese/anno (Firestore composite index).

**Indici Firestore necessari** (`firestore.indexes.json`):
- `samples`: `clientId ASC, createdAt DESC`
- `samples`: `status ASC, createdAt DESC`
- `payments`: `clientId ASC, status ASC`
- `payments/{id}/installments`: `status ASC, dueDate ASC`
- `quotes`: `status ASC, year DESC, sequence DESC`
- `quotes`: `clientId ASC, createdAt DESC`
- `reminders`: `status ASC, dueAt ASC`

---

## 12. Roadmap Step-by-Step

> Ogni step è atomico. Sonnet deve completare uno step, eseguire `pnpm typecheck` e `pnpm lint`, poi passare al successivo.

### STEP 0 — Setup repository
- [ ] `pnpm dlx create-next-app@latest vinifera --ts --app --tailwind --src-dir --eslint --import-alias "@/*"` (riusa cartella esistente).
- [ ] Aggiungi `.env.local.example` con tutte le chiavi.
- [ ] `pnpm dlx shadcn@latest init` (config: Slate, CSS variables, Tailwind v4).
- [ ] Installa pacchetti: `pnpm add firebase firebase-admin react-hook-form @hookform/resolvers zod @tanstack/react-query @tanstack/react-table date-fns @react-pdf/renderer resend lucide-react sonner recharts nuqs`.
- [ ] Devi: `pnpm add -D tsx`.
- [ ] Setup `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`.
- [ ] Crea `.cursorrules` / `AGENTS.md` con convenzioni del progetto.

### STEP 1 — Firebase init & Auth shell
- [ ] `lib/firebase/client.ts` e `lib/firebase/admin.ts` con singleton.
- [ ] `lib/auth/AuthProvider.tsx` (Context con `onAuthStateChanged`) + `useAuth`.
- [ ] `app/(auth)/login/page.tsx` con form email/password.
- [ ] Bypass dev: pulsante visibile se `process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true"`.
- [ ] `app/(app)/layout.tsx` con AuthGuard (redirect `/login` se non autenticato).
- [ ] Script `scripts/set-admin.ts` per settare custom claim.

### STEP 2 — App Shell & Navigation
- [ ] Sidebar (iPad/desktop) collassabile, con voci: Dashboard, Clienti, Analisi, Pacchetti, Campioni, Preventivi, Referti, Pagamenti, Promemoria, Statistiche, Impostazioni.
- [ ] Topbar con search, theme toggle, avatar dropdown (logout).
- [ ] MobileNav con bottom nav 5 voci + sheet "Più".
- [ ] Breadcrumb.
- [ ] Pagina Dashboard con placeholder KPI.

### STEP 3 — Schemi Zod & Tipi
- [ ] Crea `src/schemas/*.ts` per tutte le entità (sezione 4).
- [ ] Esporta tipi via `z.infer`.
- [ ] Setta `tsconfig` strict + `noUncheckedIndexedAccess`.

### STEP 4 — Settings azienda
- [ ] Pagina `/settings/company` con form completo.
- [ ] Upload logo su Storage.
- [ ] Server Action `updateCompanySettings`.

### STEP 5 — Listini (Analisi & Pacchetti)
- [ ] CRUD analisi con DataTable + form.
- [ ] CRUD pacchetti con DataTable + form.
- [ ] Soft delete + filtro "Mostra archiviati".
- [ ] Validazione codice univoco analisi.

### STEP 6 — Clienti (lista + form)
- [ ] Lista con filtri/search/responsive.
- [ ] Form Business + Individual con tab.
- [ ] Server Actions `createClient`, `updateClient`, `archiveClient`.
- [ ] Pagina dettaglio con tab navigation.

### STEP 7 — Pagamenti (model + UI base)
- [ ] Server Actions: `createPayment` (con installments), `markInstallmentPaid`, `cancelPayment`, `addManualTransaction`.
- [ ] Subcollection installments + transactions.
- [ ] Pagina `/clients/[id]/payments`.
- [ ] Pagina globale `/payments`.
- [ ] Logica derivazione `status = overdue`.

### STEP 8 — Pacchetti su cliente
- [ ] Pagina `/clients/[id]/packages`.
- [ ] Aggiungi pacchetto (con creazione pagamento opzionale, anche rateizzato).
- [ ] Annullamento con dialog "cosa fare del pagamento".
- [ ] Aggiornamento `clients.stats`.

### STEP 9 — Campioni
- [ ] Lista globale + per cliente.
- [ ] Form multi-sezione con calcoli live e selezione pacchetto.
- [ ] Transazione Firestore per: progressivo + decremento pacchetti + pagamento.
- [ ] Stati e azioni (in_progress / completed / cancelled).

### STEP 10 — Preventivi (CRUD + stati)
- [ ] Lista + filtri + numerazione progressiva annuale (transazione su `counters/quotes_YYYY`).
- [ ] Form con voci tipizzate, sconti, tasse default Enpaia 4% (on) + IVA 22% (off).
- [ ] Macchina stati con regole immutabilità.
- [ ] Calcolo totali condiviso (utility pure testata).

### STEP 11 — PDF Preventivi
- [ ] Componenti `<QuotePdfDocument />` con header, body, summary page (forced break).
- [ ] Endpoint `GET /api/pdf/quote/[id]`.
- [ ] Salvataggio copia su Storage.
- [ ] Pulsante download nel form.

### STEP 12 — Referti
- [ ] Pagina `/reports` (lista) e `/reports/new` (selezione campioni).
- [ ] Generazione PDF aggregato.
- [ ] Endpoint `GET /api/pdf/report/[id]`.
- [ ] Invio via Resend (modal con preview oggetto/testo).

### STEP 13 — Promemoria
- [ ] CRUD + vista lista + vista calendario.
- [ ] Quick-add collegabile a entità.
- [ ] Endpoint cron `/api/reminders/cron`.
- [ ] Integrazione Telegram + Resend.
- [ ] Pagina `/settings/notifications`.

### STEP 14 — Dashboard & Statistiche reali
- [ ] Implementa tutte le KPI cards.
- [ ] Grafici recharts.
- [ ] Pagina `/stats` con filtri temporali.

### STEP 15 — Landing pubblica
- [ ] `/` mobile-first con hero + sezioni + CTA login.
- [ ] SEO base (metadata, og:image).

### STEP 16 — Hardening
- [ ] Firestore Rules definitive.
- [ ] Storage Rules.
- [ ] Test sicurezza (no leak admin SDK su client).
- [ ] Error boundary + pagine 404/500.
- [ ] Loading skeleton ovunque.
- [ ] Toaster globale (sonner) per esiti azioni.

### STEP 17 — Deploy
- [ ] Setup Vercel: env vars, project linked.
- [ ] Verifica deploy preview su PR.
- [ ] Configurazione Vercel Cron in `vercel.json`.
- [ ] Documenta in README il processo di seed iniziale.

---

## 13. Convenzioni di Codice

- **TypeScript strict** sempre.
- **Zod come unica fonte di verità** per validazione (client + server).
- **Server Actions** preferite alle API route per le mutazioni (eccetto PDF e webhook).
- **Repository pattern** per accesso a Firestore (mai chiamate dirette dai componenti).
- **Snapshot dei dati** nei documenti aggregati (es. `clientSnapshot` nei preventivi) per evitare problemi di drift se l'entità cambia.
- **Naming**:
  - Componenti `PascalCase`
  - File `kebab-case.tsx` ma componenti React in `PascalCase.tsx`
  - Hook `useXxx`
  - Server Action `actionVerb` (es. `createClient`)
- **Commit**: convenzione **Conventional Commits** (`feat:`, `fix:`, `chore:`, `refactor:`).
- **Niente `any`**, niente `@ts-ignore` (al limite `@ts-expect-error` con commento).
- **Lint**: ESLint + Prettier preconfigurati. `pnpm lint` deve passare.
- **Test (opzionale v1):** Vitest per le utility pure (calcolo preventivi, calcolo pagamenti).

### 13.1 Variabili d'ambiente (`.env.local.example`)

```
# Firebase Client
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin (server only)
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

# Notifiche
RESEND_API_KEY=
RESEND_FROM_EMAIL="Vinifera <noreply@dominio.it>"
TELEGRAM_BOT_TOKEN=

# Cron security
CRON_SECRET=

# Dev
NEXT_PUBLIC_DEV_BYPASS_AUTH=false
```

---

## 14. Deploy & CI/CD

- Hosting: **Vercel** (Next.js nativo).
- Branch:
  - `main` → produzione.
  - feature branch → preview deploy automatico.
- Env vars settate nel pannello Vercel (Production / Preview / Development).
- Firebase project: uno solo per la v1 (separare prod/dev se richiesto in futuro).
- Build: `pnpm build` (Vercel default).
- Cron: `vercel.json` con `/api/reminders/cron` ogni 15 min, protetto da header `x-cron-secret`.

---

## 15. Checklist Finale Pre-Lancio

- [ ] Tutti gli endpoint protetti da auth admin
- [ ] Firestore Rules deny-by-default
- [ ] Storage Rules deny-by-default
- [ ] Nessun uso di `firebase-admin` nel client bundle (verifica con `next build --analyze`)
- [ ] PDF preventivo e referto verificati (header azienda, ultima pagina staccata)
- [ ] Numerazione progressiva annuale funziona in concorrenza (test 2 creazioni simultanee)
- [ ] Pagamenti rateizzati: marcatura overdue corretta dopo cron
- [ ] Notifiche Telegram + Email testate
- [ ] Dashboard mostra dati reali
- [ ] iPad: tutte le pagine fluide, sidebar collassa correttamente
- [ ] Mobile: bottom nav, tabelle in card view
- [ ] Dark mode coerente
- [ ] Backup automatico Firestore configurato (Google Cloud Scheduler → export)
- [ ] README con istruzioni: setup locale, seed admin, deploy, troubleshooting

---

## 16. Edge Cases, Gap & Decisioni Aperte

Sezione raccolta dopo una rilettura critica della spec. Ogni voce è una scelta esplicita o un caso da gestire.

### 16.1 Localizzazione & formati
- **Locale `it-IT`** ovunque: numeri (`1.234,56 €`), date (`gg/mm/aaaa`), prima settimana lunedì.
- **Timezone `Europe/Rome`** per tutte le date salvate "civili" (scadenze, dueAt promemoria). I `Timestamp` Firestore restano UTC; conversione in display.
- Validatori italiani:
  - `vatNumber` (P.IVA): 11 cifre + check digit.
  - `taxCode` (CF): 16 caratteri alfanumerici, formula ufficiale.
  - `sdiCode`: 7 caratteri o `0000000` se non presente.
  - `iban`: validazione formato IBAN IT.
  - `zip`: 5 cifre.

### 16.2 Anti-duplicati clienti
- Warning (non blocco) in fase di creazione cliente se già esiste un record con stessa `vatNumber` o `taxCode` o `email`.
- Vista "Possibili duplicati" in `/clients?duplicates=1` (raggruppa per email/P.IVA).

### 16.3 Cancellazione & integrità referenziale
- **Mai hard-delete** delle entità collegate. Tutto **soft delete** (`deletedAt`).
- Regole:
  - Cliente: archiviabile solo se non ha pagamenti pending o campioni in lavorazione (altrimenti dialog di blocco con elenco motivi).
  - Analisi/Pacchetto del listino: se usato in entità storiche, restano (snapshot già fatto). Si "archivia" → non più selezionabile in nuove entità.
  - Campione: cancellabile solo se status `pending`. Altrimenti `cancelled`.
- Ripristino entità archiviate: vista `/settings/archive` con restore.

### 16.4 Tariffario per cliente (price-list override)
- Aggiunta opzionale **v1.1** ma prevista nel modello: collection `clientPriceOverrides/{clientId}_{analysisId}` con `unitPrice`. La UI in detail cliente avrà tab "Prezzi personalizzati".
- In v1: solo override **inline** sulla riga di campione/preventivo (già previsto).

### 16.5 Concorrenza ottimistica
- Su tutte le entità modificabili: campo `version: number` incrementato a ogni update. Le Server Action confrontano la versione attesa: se mismatch → errore "Il documento è stato modificato da un'altra sessione, ricarica".
- I form mostrano dialog "Ricarica" quando ricevono questo errore.

### 16.6 Idempotency su Server Actions
- Tutte le `create*` Server Action accettano un `clientRequestId` (UUID generato dal form al mount). Salvato su un breve TTL store (collection `idempotency` con `expiresAt`) per evitare doppia creazione su double-click / retry.
- TTL 24h, pulizia via cron giornaliero.

### 16.7 Versionamento PDF & snapshot preventivi
- Quando un preventivo passa a `pending_approval` o `approved`, viene **congelato uno snapshot completo** (`frozenSnapshot: Quote`). Il PDF "ufficiale" rigenera sempre dallo snapshot, non dal documento live (che resta editabile finché bozza).
- Storage path: `quotes/{quoteId}/v{version}.pdf`. Manteniamo storico versioni.
- Stesso pattern per referti: una volta generato il PDF è immutabile, eventuale rigenerazione → nuova versione.

### 16.8 Allegati su entità
- Modello generico: subcollection `attachments` su `clients`, `samples`, `quotes`, `payments`.
  ```ts
  { id, fileName, mimeType, sizeBytes, storagePath, uploadedBy, uploadedAt, note? }
  ```
- UI: drag-and-drop area in fondo al detail. Anteprima PDF/immagini.
- Limiti: 10 MB/file, MIME whitelist (PDF, JPG, PNG, DOCX, XLSX).
- Storage path: `attachments/{entityType}/{entityId}/{fileId}-{fileName}`.

### 16.9 Note & timeline (audit log)
- Subcollection `activity` su entità chiave (`clients`, `samples`, `quotes`, `payments`):
  ```ts
  { id, type: "created"|"updated"|"status_changed"|"note_added"|"payment_recorded"|...,
    actor: { uid, email }, at: Timestamp, payload: any, note?: string }
  ```
- UI: pannello laterale "Attività" nei detail, ordine cronologico inverso.
- Note manuali aggiungibili dall'utente come tipo `note_added`.

### 16.10 Limiti Firestore & contention
- **`clients.stats`** rischia di essere bottleneck se vengono fatte molte scritture sullo stesso cliente (limite 1 write/sec sostenuto per documento). Mitigazione:
  - Aggiornamento via **transazione** ma asincrono via **task queue** (in v1: invocazione fire-and-forget dopo la mutazione principale; v1.1 valutare Cloud Tasks).
  - In alternativa: ricalcolo on-demand con cache di 60s su Server Component.
- **`counters/*`**: contention naturale → usare transazioni; OK fino a ~1 op/sec, sufficiente per il volume previsto.
- **`dashboardStats`**: ricalcolato dal cron ogni 15 min, non on-write, per evitare hot doc globale.

### 16.11 Workflow preventivo → campione
- Dal detail di un preventivo `approved` → pulsante **"Crea campione da preventivo"** che precompila il form campione con le voci tipo `analysis`. Le voci `package` creano invece un `clientPackage`. Le voci `free` vengono ignorate (con avviso).
- Il sample creato avrà `sourceQuoteId` per tracciabilità (campo opzionale su `samples`).

### 16.12 Promemoria ricorrenti
- Aggiungo a `reminders`:
  ```ts
  recurrence?: { rule: "daily"|"weekly"|"monthly"|"yearly", interval: number, until?: Timestamp }
  ```
- Alla "marca come fatto" di un ricorrente, il sistema crea automaticamente la prossima istanza.

### 16.13 Email transazionali — deliverability
- Dominio mittente con **SPF + DKIM + DMARC** configurati (Resend fornisce istruzioni).
- Indirizzo `noreply@` + `Reply-To` su email vera dell'azienda.
- Template React Email centralizzati in `src/emails/`.
- Tutte le email hanno: header con logo, footer con dati azienda, link "rimuovi notifiche" (apre `/settings/notifications`).
- Log invii in collection `emailLogs` (id, to, subject, template, status, error?, sentAt) per debug.

### 16.14 Telegram bot — onboarding utente
- Webhook endpoint `POST /api/telegram/webhook` (protetto da `TELEGRAM_WEBHOOK_SECRET` in URL path).
- Comando `/start <token>`: l'utente in `/settings/notifications` clicca "Collega Telegram" → genera token monouso → mostra link `https://t.me/<bot>?start=<token>` → l'utente apre, il webhook associa `chatId` allo `users/{uid}`.
- Comando `/stop`: rimuove l'associazione.

### 16.15 Pagamenti — casi particolari
- **Saldo manuale parziale**: l'admin può registrare un pagamento parziale su una rata (`paidAmount < amount`) → status resta `pending`, residuo calcolato.
- **Sovra-pagamento**: gestito come transazione `adjustment` con nota; non genera credito automatico in v1.
- **Rimborso**: transazione `refund` riduce `paidAmount`.
- **Storno totale**: pagamento `cancelled` → tutte le installments diventano `cancelled`. La transazione di storno è loggata.
- **Modifica importo dopo pagamenti**: vietata. Per correggere → annullare e ricreare.

### 16.16 Search globale (cmdk)
- `Ctrl/Cmd+K` apre command palette con:
  - Navigazione rapida (tutte le pagine)
  - Search clienti (per nome/email/P.IVA)
  - Search campioni per codice
  - Search preventivi per numero
  - Azioni rapide ("Nuovo cliente", "Nuovo preventivo"…)
- Implementato lato client con prefetch dei dati indicizzati (Firestore query con `limit(50)` su typing debounced).

### 16.17 Backup & export
- **Backup Firestore**: scheduled export su bucket GCS dedicato (1/giorno, retention 30gg). Documentato in README.
- **Export utente**: pagina `/settings/export` per scaricare CSV di clienti/campioni/preventivi/pagamenti (tramite Server Action che genera CSV in stream).
- **Storage**: lifecycle rule per backup file PDF (mantenuto in collection separata se serve).

### 16.18 Empty states & onboarding
- Ogni lista vuota mostra: icona + titolo amichevole + 1 CTA primaria + (opz.) suggerimento.
- Primo accesso admin: tour guidato (3-4 step con `react-joyride` o componente custom) che porta a creare: dati azienda → prima analisi → primo cliente.

### 16.19 Errori, vuoti, loading
- Pattern uniforme:
  - `loading.tsx` con skeleton coerente per ogni segmento App Router.
  - `error.tsx` con messaggio + pulsante "Riprova" + link "Segnala problema".
  - `not-found.tsx` per 404 contestualizzati (cliente, preventivo, ecc.).

### 16.20 Performance & bundle
- Code splitting per route (default Next).
- `@react-pdf/renderer` solo lato server (mai bundlato nel client).
- `recharts` lazy-loaded (`next/dynamic`).
- Liste con virtualizzazione (`@tanstack/react-virtual`) se > 200 righe.
- Immagini con `next/image`.

### 16.21 Convenzioni Storage path (centralizzate)
```
company/logo.{png|jpg}
quotes/{quoteId}/v{n}.pdf
reports/{reportId}/v{n}.pdf
attachments/{entityType}/{entityId}/{fileId}-{fileName}
exports/{userId}/{timestamp}-{type}.csv
```

### 16.22 Anti-leak admin SDK
- Convenzione: ogni file che importa `firebase-admin` ha `import "server-only"` come prima riga.
- Test in CI: grep che fallisce se trova `firebase-admin` in file sotto `src/components/`, `src/app/**/*.client.tsx`, ecc.

### 16.23 Feature flags / config
- Documento `settings/featureFlags`: `{ enableTelegram: bool, enableEmail: bool, enableExport: bool, devBypassAuth: bool }`.
- Letto a livello server e passato come provider; permette di spegnere funzioni rotte senza redeploy.

---

## 17. Linee Guida UX Moderne (vincolanti)

> Regola d'oro: **\"l'occhio vuole la sua\"**. Niente accozzaglia di tab, niente schermate piene di tutto. Una pagina = uno scopo + una azione primaria evidente. Quando si dubita: meno elementi, più aria.

### 17.1 Identità visiva

- **Palette** (token CSS, dark + light mode):
  - `--primary`: bordeaux profondo, usato con parsimonia (CTA, badge attivi).
  - `--accent`: oro tenue / sabbia, per highlight non-azione.
  - `--background`: off-white caldo (`oklch(0.985 0.005 80)`) / antracite caldo in dark.
  - `--muted`: grigio caldo per testi secondari.
  - **Stati**: success verde oliva, warning ambra, danger rosso vino, info blu polvere.
  - Niente saturazioni "neon".
- **Tipografia**:
  - UI: **Inter** (400/500/600/700).
  - Display landing: **Fraunces** (italic per accento sui titoli hero).
  - Scala modulare 1.250 (Major Third). Heading h1 ~ 2.25rem.
  - Line-height generosa (1.5 testo, 1.2 heading).
- **Spaziatura**: scala Tailwind, ma preferire `gap-6` / `p-6` di base sulle card. Mai schermate "compresse".
- **Border radius**: `rounded-xl` sui container principali, `rounded-lg` su input/button. Coerenza assoluta.
- **Shadow**: usate raramente, solo per elementi flottanti (popover, dialog, toast). Preferire bordi sottili `border` per separare.
- **Iconografia**: solo `lucide-react`, stroke 1.75, dimensione coerente per contesto (16/20/24).

### 17.2 Layout & gerarchia

- **AppShell** con sidebar fissa stile Linear/Notion: 280px aperta, 64px collassata (icone + tooltip). Niente sidebar a 3 livelli.
- **Header pagina** sempre con stessa struttura:
  - Breadcrumb sottile (testo `muted`).
  - Titolo H1 + sottotitolo opzionale.
  - A destra: 1 azione primaria (button `primary`) + max 2 secondarie (in dropdown se servono altre).
- **Contenuto** in container con `max-w-screen-2xl mx-auto` e padding generoso.
- **Sezioni** separate da `Separator` o spacing, mai da bordi pesanti.

### 17.3 No-tab philosophy (regola dura)

- **Tab consentite solo** quando:
  1. I contenuti sono **veramente alternativi** (non sequenziali).
  2. Sono al massimo **4-5**.
  3. L'utente passa da uno all'altro frequentemente.
- Per tutti gli altri casi: **page navigation con sub-route** (es. dettaglio cliente con sidebar secondaria di sezione, non tab orizzontali).
- **Decisione concreta per il dettaglio cliente**: invece di 5 tab orizzontali, uso **left rail secondario** (icona + label) tipo Stripe Customer detail. Quando lo schermo è < lg, collassa in un dropdown "Sezioni".

### 17.4 Pattern di interazione

- **Drawer / Sheet** preferiti a nuove pagine per: form veloci (nuovo promemoria, nuova nota, nuova rata), preview rate pagamento, dettaglio rapido cliente da una lista.
- **Dialog (modal)** solo per azioni distruttive o conferme critiche.
- **Inline editing** per campi singoli (nome, prezzo lista, data scadenza). Click → diventa input → blur o `Enter` salva. Optimistic update + toast su errore.
- **Command palette** (`Cmd/Ctrl+K`) sempre disponibile.
- **Bulk action bar** che appare in sticky bottom quando si selezionano righe in tabella.
- **Quick actions** sulle righe di tabella (hover su desktop, swipe su mobile, long-press su iPad).
- **Keyboard shortcuts** documentati (`?` apre cheatsheet): `c` nuovo cliente, `p` nuovo preventivo, `s` nuovo campione, ecc.

### 17.5 Form

- Form lunghi: **wizard a step** (max 4 step, progress bar in alto, possibilità di tornare indietro).
- Form medi: **sheet laterale** che non copre il contesto.
- Form brevi: **dialog**.
- **Validation**: inline, sotto al campo, in italiano, gentile (\"L'email non sembra valida\" non \"Invalid email\").
- **Stato di salvataggio** sempre visibile: bottone con spinner, disabilitato durante submit; toast su successo; mantieni il form aperto per modifiche rapide successive (configurabile).
- **Autosave bozze**: per form lunghi (preventivi, campioni) salvataggio automatico in `localStorage` ogni 5s + indicatore \"Bozza salvata\".

### 17.6 Tabelle & liste

- Header sticky, righe alte (h-14 minimo per touch).
- Hover row con highlight tenue + reveal azioni a destra.
- **Filtri persistenti in URL** (`nuqs`) → condivisibili e bookmark-friendly.
- **Sort multiplo** opzionale.
- **Saved views** (v1.1): l'utente salva un set di filtri con un nome.
- **Density toggle** (\"Comodo\" / \"Compatto\") salvato in user prefs.
- Su mobile: **card list** con info principali + chevron → drawer dettaglio. Nessuna tabella scrollabile orizzontalmente.

### 17.7 Stati & feedback

- **Skeleton loaders** che riproducono la forma reale del contenuto (non spinner generici).
- **Empty states** progettati: illustrazione SVG sobria + titolo + 1 CTA. Esempi:
  - Lista clienti vuota: \"Ancora nessun cliente. Iniziamo con il primo.\" + [+ Nuovo cliente].
  - Promemoria vuoti: \"Tutto sotto controllo 🍷\" (l'unica emoji ammessa, in tema).
- **Toast (sonner)** in basso a destra, durata 4s, swipe to dismiss. Mai per errori critici (lì serve dialog).
- **Status badge** color-coded e coerenti su tutta l'app:
  - `pending` grigio, `in_progress` blu, `completed` verde, `cancelled` rosso scuro, `overdue` ambra/rosso, `draft` grigio outline, `approved` verde, `rejected` rosso, `paid` verde.
- **Progress** per operazioni > 1s (es. generazione PDF, export CSV).

### 17.8 Motion & micro-interazioni

- Libreria: **framer-motion** (o `motion`).
- Regole:
  - Durate brevi: 150ms hover, 200ms transizioni di stato, 300ms entrate sheet/dialog.
  - Easing `ease-out` per entrate, `ease-in` per uscite.
  - Niente bounce, niente \"wow\". L'animazione serve a comunicare causa-effetto.
- Reduce motion rispettato (`prefers-reduced-motion`).

### 17.9 Dark mode

- Toggle in topbar + auto da sistema.
- **Stessa gerarchia** chiaro/scuro: non scurire solo i colori, ridurre saturazione di accent e ombre.
- Test obbligatorio: ogni componente reso in entrambi i temi prima del merge.

### 17.10 iPad-first concretamente

- Breakpoint principali di lavoro: **iPad portrait (834px)**, **iPad landscape (1194px)**, desktop (1440+).
- Sidebar su iPad portrait: collassata di default, espandibile con tap.
- Modali centrate, larghe ~640px su iPad, full-screen sotto `sm`.
- Tap target minimo 44px, spaziatura tra azioni ≥ 8px.
- Gesture: swipe-to-go-back nei drawer, swipe sulle card per quick action.

### 17.11 Mobile

- Bottom navigation a 5 voci (Dashboard, Clienti, Campioni, Preventivi, Più).
- FAB (Floating Action Button) contestuale per l'azione primaria della sezione (es. \"+ Cliente\").
- Drawer full-screen invece di sheet laterali.
- Card list ovunque al posto di tabelle.

### 17.12 Branding del PDF (coerente con UI)

- Stessa palette + stessa tipografia (Inter embed).
- Header con logo + dati azienda allineati con stessa griglia della UI.
- Tabelle con righe alternate sottili, senza bordi pesanti.
- Footer con numerazione `Pagina X di Y` + nota legale opzionale.

### 17.13 Reference visive (ispirazione)

L'AI dovrebbe puntare allo stile di: **Linear**, **Stripe Dashboard**, **Pitch**, **Notion**, **Vercel Dashboard**. Lontano da: gestionali tradizionali italiani (TeamSystem, Zucchetti…), Bootstrap default, dashboard \"Material Design\" anni 2018.

### 17.14 Definition of Done UX (per ogni schermata)

- [ ] Una sola azione primaria evidente.
- [ ] Empty state progettato.
- [ ] Loading skeleton coerente.
- [ ] Error state utile (con retry).
- [ ] Funziona su iPad portrait senza scroll orizzontale.
- [ ] Funziona su mobile 375px senza tagli.
- [ ] Dark mode verificata.
- [ ] Tutti i form con validazione inline italiana.
- [ ] Almeno una shortcut da tastiera per l'azione primaria (desktop/iPad con keyboard).
- [ ] Nessuna tab "di comodo": se ci sono > 4 tab, ripensare la struttura.

---

## 18. Hardening Anti-Bug Logici (regole tecniche vincolanti)

> Sezione finale dedicata a chiudere i bug più subdoli che tipicamente nascono in un CRM con soldi, date, concorrenza e PDF. **Sonnet deve trattare queste regole come INVARIANTI: se un'implementazione le violerebbe, va cambiata l'implementazione, non la regola.**

### 18.1 Money — interi in centesimi, sempre

- **Tutti gli importi salvati su Firestore sono `number` interi in CENTESIMI di euro.** Mai float.
  - Esempio: 12,50 € → `1250`.
- I form mostrano/accettano formato umano (`12,50`), ma convertono in centesimi via `zod.transform` prima di toccare il DB.
- Utility centralizzate in `src/lib/utils/money.ts`:
  - `toCents(input: string | number): number`
  - `fromCents(cents: number): number`
  - `formatEUR(cents: number): string` (usa `Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" })`)
  - `addCents`, `subCents`, `mulCentsByQty`, `applyPercentCents` (con `Math.round`).
- **Regola d'oro**: `+`, `-`, `*` su importi senza passare dalle utility → fallisce code review.

### 18.2 Rounding di percentuali e split rate

- Sconti/tasse percentuali: `Math.round((amountCents * percent) / 100)`.
- **Split rate** (es. 100€ in 3 rate):
  - `base = Math.floor(totalCents / N)`
  - `remainder = totalCents - base * N`
  - Le **prime** `remainder` rate hanno `base + 1`, le restanti `base`.
  - **Invariante**: `sum(installments.amount) === totalCents` SEMPRE.
  - Funzione pura `splitInCents(total, n): number[]` con test unitario obbligatorio.

### 18.3 Calcolo totali — single source of truth

- Le funzioni `computeQuoteTotals`, `computeSampleTotal`, `derivePaymentStatus` vivono in `src/lib/calc/` e sono **pure** (input → output, nessun IO).
- Usate **identiche** lato client (preview live) e lato server (Server Action).
- Test Vitest **obbligatori** per ognuna.
- Vietato duplicare la logica di calcolo dentro componenti React.

### 18.4 Date & timezone

- Tutte le date salvate come `Timestamp` Firestore (UTC).
- Per "date civili" (scadenze rate, `dueAt` promemoria, `validUntil` preventivi):
  - L'utente sceglie una **data** (no orario) → salvata come `Timestamp` corrispondente alle **23:59:59.999 di Europe/Rome di quel giorno**.
  - Conversione fatta in `src/lib/utils/date.ts` con `date-fns-tz`.
  - Motivo: una rata "scade il 10/06" deve essere `overdue` solo a partire dall'11/06 ora italiana.
- **DST**: mai aritmetica con `+ 86400000`. Sempre `addDays`/`addMonths` di `date-fns` (gestiscono DST e mesi corti).
- Format display: sempre via util, mai inline.

### 18.5 Transazioni Firestore — limiti & pattern

- Limite duro: **500 operazioni per transazione**.
- **Tutte le letture PRIMA delle scritture** dentro `runTransaction`. Violare = errore runtime.
- Mai effetti collaterali esterni (HTTP, email, Telegram) **dentro** una transazione: vanno fatti **dopo** il commit (pattern "after-commit").
- Pattern centrale in `src/server/transactional.ts`:
  ```ts
  export async function withAfterCommit<T>(
    fn: () => Promise<T>,
    sideEffects: (result: T) => Promise<void>,
  ): Promise<T> {
    const result = await fn();
    queueMicrotask(() => sideEffects(result).catch(logError));
    return result;
  }
  ```
- Quando le scritture superano 500: `WriteBatch` chunked (ordine esplicito, idempotenza).

### 18.6 Race condition pacchetti

- Decremento di `clientPackages.remainingAnalyses` **dentro la stessa transazione** della creazione del campione.
- Lettura del pacchetto **dentro** la transazione (mai pre-letta), confronto `remainingAnalyses >= dec`, altrimenti throw.
- La UI può mostrare residui non-transazionali (informativi); l'autorità è la transazione server.
- Quando un campione `cancelled` aveva analisi coperte: **restituire** le unità al pacchetto in transazione (`restore`) e riportare `status` da `exhausted` a `active` se applicabile.

### 18.7 Stato pagamenti — derivato, mai disallineato

- `payments.status` è **derivato**:
  - `cancelled` se annullato esplicitamente;
  - altrimenti `paid` se `paidAmount >= totalAmount`;
  - altrimenti `overdue` se esiste almeno una `installment` con `dueDate < now() && status === "pending"`;
  - altrimenti `partial` se `paidAmount > 0`;
  - altrimenti `pending`.
- Una sola funzione `derivePaymentStatus(payment, installments)` in `src/lib/calc/`.
- Salvato denormalizzato per query veloci, ma **ricalcolato** ad ogni mutazione di `installments`/`transactions` nella stessa transazione.
- Cron giornaliero rivaluta i pagamenti `pending`/`partial` per intercettare il passaggio a `overdue` causato dal solo trascorrere del tempo.

### 18.8 Soft delete + vincoli univoci

- I campi univoci (`analyses.code`, `quotes.number`, `samples.code`) NON devono collidere con record archiviati.
- L'unicità si verifica **solo tra record con `deletedAt == null`**.
- Implementazione: query `where("code","==",x).where("deletedAt","==",null).limit(1)` **dentro transazione** + creazione di un doc lock in `locks/{type}_{value}` (`get` + `set` se assente) per evitare race a livello di concorrenza alta.

### 18.9 Numerazione progressiva — anti-race

- `counters/{collection}_{year}` modificato in **transazione** (`get` + `set`).
- **Mai** dedurre il prossimo numero da `count()` di documenti (race + lento + costoso).
- Padding fisso 4 cifre.
- Test obbligatorio: 5 creazioni simultanee → 5 numeri sequenziali distinti.

### 18.10 React Query + Firestore realtime — una sola fonte per dato

- **Regola**: per ogni dato, una sola sorgente di cache:
  - **React Query** per liste paginate / dettagli on-demand.
  - **Realtime listener** (`onSnapshot`) solo dove serve davvero (dashboard, lista campioni in laboratorio).
- Helper centralizzato `useFirestoreQuery` / `useFirestoreDoc` in `src/hooks/firestore/` che wrappa `onSnapshot` ma usa `queryClient.setQueryData` come unico store, così non ci sono due verità.
- Mai mischiare i due pattern sullo stesso dato in componenti diversi.

### 18.11 Auth — bypass dev davvero sicuro

- `NEXT_PUBLIC_DEV_BYPASS_AUTH` è solo un **hint UI** (mostra il bottone in login).
- Il check vero è server-side: `requireAdmin()` rifiuta sempre se `process.env.NODE_ENV === "production"`, indipendentemente da qualsiasi flag.
- Il flag client non può creare token validi: in dev il bypass logga un account `dev@vinifera.local` reale precreato negli **Emulatori Firebase**, mai in prod.
- CI: grep di sanity che fallisce se trova `DEV_BYPASS_AUTH=true` in file `.env.production*`.

### 18.12 Sessione & ID Token

- Client: ID token in memoria (no localStorage).
- Server Action / Route: `middleware.ts` verifica un **session cookie httpOnly** (Firebase session cookie via admin SDK, durata 7gg, `secure`, `sameSite=lax`).
- Refresh: Server Action `refreshSession` rinnova il cookie quando manca < 24h alla scadenza.
- Logout: `revokeRefreshTokens(uid)` + cancella cookie.

### 18.13 Telegram webhook — sicurezza

- URL con **secret path** non prevedibile: `/api/telegram/webhook/{TELEGRAM_WEBHOOK_SECRET}`.
- Verifica `update.message.from.id` matchi un `users.telegramChatId` registrato per i comandi sensibili.
- Rate limit per chatId (Firestore `rateLimits/{chatId}` con `expiresAt`).

### 18.14 Cron — sicurezza & idempotenza

- Endpoint cron protetti da `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron lo invia automaticamente quando configurato).
- **Idempotenza**: un run del cron promemoria deve poter essere eseguito 2 volte senza inviare 2 notifiche → check `notifiedAt` PRIMA di inviare e set **dopo** invio riuscito.
- Lock di esecuzione: doc `locks/cron_{name}` con TTL 5 min, per evitare run sovrapposti (Vercel può schedulare in modo aggressivo).

### 18.15 PDF generation su Vercel — limiti

- Hobby plan: **10s timeout**. Pro: 60s. Configurare `export const maxDuration = 60` nel route handler PDF.
- `@react-pdf/renderer` è pesante: warm-up al primo render, mantenere il bundle server-only.
- Limite massimo **100 campioni per referto** (validato server-side, messaggio "Suddividi il referto").
- Per documenti molto grandi, valutare `pdf-lib` per merge di chunk in v1.1.

### 18.16 Job lunghi — pattern async (predisposto, non implementato in v1)

- Modello previsto: collection `jobs` con `status`, `progress`, `resultUrl`, `error`. In v1 tutti i PDF sono sincroni; nessun job lungo presente.

### 18.17 Storage — sicurezza & privacy

- Tutti i file privati (PDF, allegati). Mai URL pubblici.
- Download: Server Action genera **signed URL** con scadenza 5 minuti (admin SDK). Mai esporre URL diretti.
- Path determinati server-side (no path injection da input utente nel filename).
- Validazione MIME server-side dopo upload tramite magic bytes (`file-type`).

### 18.18 Validazione client vs server

- Zod schemas in `src/schemas/` sono l'**unica fonte di verità**: importati sia dai form (resolver `react-hook-form`) sia dalle Server Action.
- **Mai** assumere dati validi: la Server Action **rivalida sempre** anche se il client lo ha già fatto.
- Errori di validazione tipizzati (discriminated union) restituiti al client per mostrare messaggi inline.

### 18.19 Indici Firestore — workflow

- `firestore.indexes.json` mantenuto aggiornato e versionato.
- Quando si aggiunge una query con `where + orderBy` o `where` su due campi diversi: indice aggiunto subito + `firebase deploy --only firestore:indexes`.
- CI: deploy indices in dry-run su PR.

### 18.20 Paginazione

- Tutte le liste server-driven: cursor-based con `startAfter(lastDoc)` + `limit(pageSize)`. Default 25 desktop / 15 mobile.
- **Mai** offset (Firestore non lo supporta efficientemente).
- Cursor **non** in URL (URL ha solo filtri/sort), ma in `useInfiniteQuery`.

### 18.21 Snapshot vs riferimenti — consistenza storica

- Documenti aggregati (preventivi, campioni, pagamenti) snapshottano `nameSnapshot` e `priceSnapshot` dal listino al momento della creazione.
- Il riferimento (`analysisId`, `packageId`) è mantenuto **solo per audit**, non per leggere dati live.
- Se l'analisi viene archiviata o rinominata: i preventivi/campioni storici **non cambiano** (mostrano lo snapshot).

### 18.22 Stale data dopo mutazione

- Dopo ogni Server Action di mutazione: `revalidatePath` o `revalidateTag` per la cache Next.
- Lato client: `queryClient.invalidateQueries({ queryKey: [...] })` in `mutation.onSuccess`.
- L'utente non deve mai dover "ricaricare la pagina".

### 18.23 Logging & osservabilità

- **Sentry** integrato (free tier) per errori client + server. DSN in env.
- Logger strutturato in `src/lib/logger.ts` con livelli `info|warn|error`. JSON in prod (Vercel logs ricercabili).
- **Mai** loggare token, chiavi, dati personali completi (mascheramento nelle utility log).

### 18.24 App Check (consigliato)

- Firebase **App Check** con reCAPTCHA Enterprise sul client web → previene abuso anonimo del progetto Firebase.
- Da abilitare quando il progetto è online e DNS pronto.

### 18.25 Migrations & seed

- `scripts/migrations/` con script numerati `001_*.ts`, `002_*.ts`. Tutti idempotenti.
- `seed-listino.ts` per popolare analisi/pacchetti base in dev.
- `set-admin.ts` per primo admin via custom claim.

### 18.26 Test minimi richiesti (Vitest, vincolanti)

Solo per la logica pura (resto opzionale v1):

- `splitInCents` — distribuzione rate (totali esatti, edge `n=1`, `total=0`).
- `computeQuoteTotals` — sconti, tasse, edge case (totale 0, sconti > subtotale).
- `computeSampleTotal` — con/senza pacchetto, `chargeAnyway`.
- `derivePaymentStatus` — tutti i 5 stati.
- Validazioni P.IVA / CF (vettori positivi e negativi noti).
- Conversioni money `toCents`/`fromCents` (no perdita di precisione su `1.235`, `0.1`, ecc.).

### 18.27 Edge case espliciti da gestire

| Caso | Comportamento atteso |
|---|---|
| Preventivo con totale 0 | Consentito (omaggio). PDF mostra "OMAGGIO". |
| Preventivo con sconti > subtotale | `total = max(0, …)`. Avviso non bloccante in form. |
| Cliente senza P.IVA né CF (estero) | Consentito se `country !== "IT"`. Validatori IT skippati. |
| Sample con 0 analisi | Bloccato dal form (almeno 1). |
| Pacchetto con `remainingAnalyses < 0` | Impossibile per design (transazione blocca). Sentry alert se accade. |
| Pagamento con `installmentsCount = 0` | Impossibile, min = 1. |
| Cancellazione cliente con dati attivi | Bloccata con dialog elenco motivi. |
| Modifica preventivo `approved` | Bloccata. Solo "Duplica come bozza". |
| PDF di preventivo `draft` | Consentito ma con watermark "BOZZA" sul PDF. |
| Email/Telegram non configurati | Server Action invio fa no-op + log warning, non errore. |
| Concurrent edit dello stesso doc | Mismatch `version` → toast "Documento aggiornato altrove" + reload form. |
| Rate restituite a pacchetto annullato con campione collegato | Dialog di conferma + transazione di restore. |
| Cancellazione campione `completed` con referto già emesso | Bloccata. |
| Cliente cancellato (soft) referenziato in preventivi | Snapshot mantiene visualizzazione; nuove operazioni bloccate. |

### 18.28 Naming & schema discipline

- **Nessun `any`**. **Nessun `as` cast** salvo casi documentati con `// SAFE:` e motivazione.
- Tipi derivati da zod: `export type Client = z.infer<typeof ClientSchema>`. Mai duplicare le interfacce.
- Date in TS: usare `Date` o `Timestamp` (firebase) con conversione esplicita ai bordi del sistema. **Vietato** passare numeri "millis" non taggati in giro.
- Niente import circolari; ESLint regola attiva.
- Niente `console.log` in commit (solo `logger`).

---

## Appendice A — Esempio calcolo totale preventivo (in centesimi)

> Coerente con §18.1: **tutti gli importi sono in CENTESIMI di euro (interi)**.

```ts
// src/lib/calc/quote.ts
import { applyPercentCents } from "@/lib/utils/money";

export function computeQuoteTotals(quote: Quote) {
  const subtotal = quote.items.reduce(
    (acc, it) => acc + it.quantity * it.unitPriceCents, // entrambi interi
    0,
  );

  let afterDiscounts = subtotal;
  for (const d of quote.discounts) {
    const cut =
      d.type === "percent"
        ? applyPercentCents(afterDiscounts, d.value)
        : d.valueCents;
    afterDiscounts -= cut;
  }
  afterDiscounts = Math.max(0, afterDiscounts);

  let afterTaxes = afterDiscounts;
  for (const t of quote.taxes) {
    if (!t.applied) continue;
    afterTaxes += applyPercentCents(afterDiscounts, t.percent);
  }

  return {
    subtotalCents: subtotal,
    discountedCents: afterDiscounts,
    totalCents: afterTaxes,
  };
}
```

---

## Appendice B — Pseudocodice Server Action `createSample`

```ts
"use server";
export async function createSample(input: NewSampleInput) {
  await requireAdmin();
  const parsed = NewSampleSchema.parse(input);

  return adminDb.runTransaction(async (tx) => {
    // 1. progressivo
    const counterRef = adminDb.doc(`counters/samples_${currentYear()}`);
    const counter = await tx.get(counterRef);
    const next = (counter.data()?.current ?? 0) + 1;
    tx.set(counterRef, { current: next, updatedAt: now() }, { merge: true });
    const code = `C-${currentYear()}-${pad4(next)}`;

    // 2. decremento pacchetti
    const packageDecrements = new Map<string, number>();
    for (const item of parsed.items) {
      if (item.coveredByPackageId) {
        packageDecrements.set(
          item.coveredByPackageId,
          (packageDecrements.get(item.coveredByPackageId) ?? 0) + 1,
        );
      }
    }
    for (const [pkgId, dec] of packageDecrements) {
      const pkgRef = adminDb.doc(`clientPackages/${pkgId}`);
      const pkgSnap = await tx.get(pkgRef);
      const pkg = pkgSnap.data();
      if (!pkg || pkg.remainingAnalyses < dec) throw new Error("Pacchetto non disponibile");
      const remaining = pkg.remainingAnalyses - dec;
      tx.update(pkgRef, {
        remainingAnalyses: remaining,
        status: remaining === 0 ? "exhausted" : pkg.status,
        updatedAt: now(),
      });
    }

    // 3. crea sample
    const sampleRef = adminDb.collection("samples").doc();
    const estimatedTotal = computeSampleTotal(parsed);
    tx.set(sampleRef, { id: sampleRef.id, code, ...parsed, estimatedTotal, status: "pending", createdAt: now(), updatedAt: now() });

    // 4. crea pagamento se richiesto
    if (parsed.createPayment && estimatedTotal > 0) {
      const payRef = adminDb.collection("payments").doc();
      tx.set(payRef, buildPaymentDoc(payRef.id, parsed.clientId, sampleRef.id, estimatedTotal, parsed.installmentsPlan));
      const installments = buildInstallments(estimatedTotal, parsed.installmentsPlan);
      for (const inst of installments) {
        const instRef = payRef.collection("installments").doc();
        tx.set(instRef, { id: instRef.id, ...inst });
      }
      tx.update(sampleRef, { paymentId: payRef.id });
    }

    // 5. aggiorna stats cliente (denormalizzato)
    // ...
    return sampleRef.id;
  });
}
```

---

## Appendice C — Regole d'oro per Sonnet (checklist mentale, ogni step)

> Prima di considerare uno step "fatto", Sonnet rilegge questa lista. Se anche **una** regola è violata, lo step non è completo.

### Architetturali
1. Rispetta **rigorosamente** la struttura cartelle in §6.
2. Tipi e validazione: zod è l'unica fonte di verità (§18.18). Tipi via `z.infer`.
3. Non usare `firebase-admin` nel bundle client. Ogni file admin → prima riga `import "server-only"` (§18.22 §4 §13).
4. Server Action per le mutazioni; Route Handler solo per PDF/webhook/cron (§3).
5. Repository pattern: niente accesso Firestore diretto dai componenti (§13).

### Dati & integrità
6. **Money in centesimi interi** sempre. Mai float. Solo via `src/lib/utils/money.ts` (§18.1).
7. **Date civili**: salvataggio a fine giornata Europe/Rome (§18.4). Mai aritmetica con millis grezzi.
8. **Snapshot** dei dati correlati nei documenti aggregati (§18.21).
9. **Soft delete** ovunque; vincoli univoci solo tra `deletedAt == null` (§18.8).
10. **Concurrent edit**: `version` incrementale + check in Server Action (§16.5).
11. **Idempotency**: `clientRequestId` su tutte le `create*` (§16.6).

### Concorrenza
12. Mutazioni multi-entità → `runTransaction`. Letture **prima** delle scritture. Side-effects **dopo** il commit (§18.5).
13. Decremento pacchetti / counter / unicità → **dentro** transazione (§18.6 §18.9 §18.8).
14. Cron idempotenti, lock anti-overlap, secret obbligatorio (§18.14).

### Calcoli
15. `computeQuoteTotals`, `computeSampleTotal`, `derivePaymentStatus`, `splitInCents` → **funzioni pure in `src/lib/calc/`**, **identiche** client/server, con test Vitest (§18.3 §18.26).
16. `payments.status` è derivato dalla funzione canonica, ricalcolato a ogni mutazione (§18.7).

### UX (vedi §17)
17. Una sola azione primaria per pagina. Niente accozzaglia di tab (regola dura).
18. Empty state, loading skeleton, error state per **ogni** schermata (§17.14).
19. iPad portrait + mobile 375px verificati senza scroll orizzontale.
20. Dark mode verificata componente per componente.
21. Form lunghi → wizard + autosave bozza in localStorage.

### Qualità
22. Niente `any`, niente `as` non motivato, niente `console.log` in commit (§18.28).
23. Componente > 200 righe → valuta lo split.
24. Italiano nei testi UI, inglese in identificatori/codice.
25. Ad ogni step: `pnpm typecheck` ✅, `pnpm lint` ✅, `pnpm build` ✅, test pure functions ✅.

### Sicurezza
26. `requireAdmin()` server-side su **ogni** Server Action / Route Handler.
27. `DEV_BYPASS_AUTH` solo in sviluppo, server rifiuta in `NODE_ENV=production` comunque (§18.11).
28. File su Storage solo via signed URL a 5 minuti (§18.17).
29. Webhook Telegram con secret path + verifica origine (§18.13).

### Quando in dubbio
30. **Scegli il comportamento meno sorprendente per l'utente.** Se anche dopo aver letto la spec resta ambiguo, lascia un commento `// SPEC?:` con la domanda invece di indovinare, e proponi nel PR.

---

## Appendice D — Note di rinominazione campi (allineamento §18.1)

Per coerenza con la regola "money in centesimi", quando Sonnet implementerà gli schemi della §4 deve usare il suffisso `Cents` su tutti i campi monetari interi:

- `analyses.defaultPrice` → `defaultPriceCents`
- `packages.price` → `priceCents`
- `clientPackages.price` → `priceCents`
- `samples.items[].unitPrice` → `unitPriceCents`
- `samples.estimatedTotal` → `estimatedTotalCents`
- `quotes.items[].unitPrice` → `unitPriceCents`
- `quotes.discounts[].value` (se `type === "fixed"`) → `valueCents`
- `quotes.subtotal/total` → `subtotalCents/totalCents`
- `payments.totalAmount/paidAmount` → `totalAmountCents/paidAmountCents`
- `payments/installments.amount/paidAmount` → `amountCents/paidAmountCents`
- `payments/transactions.amount` → `amountCents`
- `clients.stats.totalRevenue/pendingAmount/overdueAmount` → suffisso `Cents`

Le percentuali (`taxes.percent`, `discounts.value` con `type=percent`) restano numeri (es. `4`, `22`, `10.5`) — non sono valute.
