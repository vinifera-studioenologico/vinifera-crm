# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Vinifera CRM — iPad-first gestionale for oenology testing labs (clients, samples, analyses,
quotes, reports, packages, payments, reminders, stats). Italian-language product; UI copy,
Firestore field names in code are English, but Zod validation messages and UX text are Italian.

Stack: Next.js 16 (App Router) · TypeScript strict · Firebase (Firestore + Storage + Auth) ·
Tailwind CSS v4 · shadcn/ui · React Query · React Hook Form + Zod · @react-pdf/renderer · Vercel.

`PROJECT_SPEC.md` is the original design/roadmap doc (data model, module specs, edge cases,
binding UX guidelines in §17). It documents intent, not always current file layout — verify
against actual source before relying on structural details (e.g. it describes a
`server/repositories/` layer that was never built; actions call Firestore directly instead).
It also describes a Telegram bot onboarding **webhook** (§16.14/§18.13, `POST
/api/telegram/webhook/{secret}`) that was likewise never built — there is currently **no webhook
handler anywhere in this repo**. Telegram notifications work today via `TELEGRAM_BOT_TOKEN` /
`TELEGRAM_CHAT_ID` set manually in `settings/notifications`, read directly by the reminder
scheduler (see **Scheduled jobs & notifications** below). Don't go looking for a webhook route, and
don't assume one needs adding unless a task specifically calls for the onboarding flow.

## Commands

```bash
npm run dev          # dev server (localhost:3000)
npm run build         # production build
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm test              # vitest run (single run)
npm run test:watch    # vitest watch mode
npm run check          # typecheck && lint && test && build — run before considering work done
```

Run a single test file: `npx vitest run src/lib/utils/money.test.ts`

Seeding / one-off scripts (all `tsx`, in `scripts/`): `npm run seed`, `seed:costs`, `seed:services`,
`seed:all` (clean + reseed everything), `db:import-analyses`. Firebase emulators: `npm run emulators`.

CI (`.github/workflows/ci.yml`) runs typecheck → lint → test on push/PR to `main`. No build step in CI.

## Architecture

**Read/write split:**
- **Reads** go through the Firebase Client SDK + React Query (`src/lib/react-query.tsx`), giving
  realtime updates and caching. Hooks live in `src/hooks/`.
- **Writes** (and anything requiring consistency, transactions, or secrets) go through **Server
  Actions** in `src/server/actions/`, using `firebase-admin` (`src/lib/firebase/admin.ts`).
  API routes (`src/app/api/`) are reserved for things a Server Action can't do: PDF generation,
  Vercel cron endpoints, file/AI-parsing uploads for costs, the PostHog analytics proxy, auth
  session cookie management, and — unlike the other categories — the **public API consumed by
  `vinifera-site`** (`/api/public/*`, see below), which is intentionally unauthenticated by session
  and instead gated by a shared bearer key. API routes are not a place for ordinary admin
  mutations; if it's an authenticated admin action, it belongs in `src/server/actions/`.

**No repository layer.** Server Actions talk to Firestore directly via `adminDb`. Each action file
owns a `COL` constant and hand-written `toXDoc()` converters mapping Firestore snapshots to typed
docs (bracket-notation field access, e.g. `data["displayName"]`, not dot access — keeps strict TS
happy on loosely-typed `DocumentData`).

**Every Server Action starts with two lines**, in this order:
```ts
"use server";
import "server-only";
```
then calls `requireAdmin()` (`src/server/auth.ts`) as its first statement. `requireAdmin` reads the
`__session` cookie via `firebase-admin/auth`, except in dev where `NEXT_PUBLIC_DEV_BYPASS_AUTH=true`
short-circuits to a fake admin user — that bypass is hard-blocked if `NODE_ENV === "production"`.
Any file importing `firebase-admin` must have `import "server-only"` as its first line (prevents
leaking the admin SDK into the client bundle).

**Auth/routing:** `src/middleware.ts` protects a hardcoded list of top-level paths (`/dashboard`,
`/clients`, `/samples`, …) by checking for the `__session` cookie, with the same dev-bypass escape
hatch. Unauthenticated access redirects to `/login?callbackUrl=...`.

**Data conventions:**
- All Firestore docs have `id`, `createdAt`, `updatedAt` (Timestamp), soft delete via
  `deletedAt: Timestamp | null`. Optimistic concurrency via an integer `version` field.
- All monetary values are stored and computed as **integer cents**, never floats. Use
  `src/lib/utils/money.ts` (`toCents` / `fromCents`) for every conversion — never do arithmetic on
  a decimal euro amount.
- Zod schemas in `src/schemas/` are the single source of truth for validation, shared client +
  server, and exported as a barrel from `src/schemas/index.ts`; TS types are derived via
  `z.infer`. Add new entity schemas there and re-export from `index.ts`.
- Aggregated/denormalized data (e.g. `clientSnapshot` embedded in a quote) is intentional —
  it's a point-in-time snapshot to avoid drift if the source entity changes later, not a bug to
  normalize away.

**PDF generation** (`src/components/pdf/`, rendered via `@react-pdf/renderer`) is server-only —
never import it into a client component/bundle.

**Firestore/Storage security rules** (`firestore.rules`, `storage.rules`) are deny-by-default;
update both the rule file and `firestore.indexes.json` together when queries change shape.

## Public API & site integration (`vinifera-site`)

`vinifera-site` (separate repo, separate deploy) talks to this CRM over plain HTTPS — no shared
code, no Firestore access from the site. Three endpoints under `src/app/api/public/` and
`src/server/public/` exist specifically for that integration and follow a **different auth model**
than the rest of the app: no session cookie, no `requireAdmin()` — instead `verifyApiKey()`
(`src/lib/api-key.ts`) does a timing-safe compare of the request's `Authorization: Bearer <token>`
against the `CRM_API_KEY` env var, which must be identical to the site's own `CRM_API_KEY`.

- **`POST /api/public/leads`** (`src/server/public/leads.ts`) — receives leads submitted through
  the site's lead-capture modal, validated against `IncomingLeadSchema` (`src/schemas/lead.ts`,
  notably **not** re-exported from `src/schemas/index.ts` — it's a public intake schema, not a core
  entity, so import it directly), then calls `createLeadFromWebsite()` to create the CRM lead
  record. The site's forward to this endpoint is fire-and-forget, so if this endpoint 500s the site
  still tells its user the lead was received — check here (and this endpoint's logs) first if a
  reported lead never shows up in the CRM.
- **`GET /api/public/services`** (`src/server/public/services.ts`) — the CRM is the source of truth
  for the public service catalog (content, pricing, availability) the site renders on `/servizi`.
  The site caches this for 5 minutes; if you change service data via the admin UI and don't see it
  on the live site quickly, that's expected — it resolves itself within the cache window, or
  instantly if `triggerSiteRevalidation()` fired successfully (see below).
- **`triggerSiteRevalidation()`** (`src/server/actions/services.ts`) — after an admin edits a
  service, this fires a fire-and-forget `POST ${SITE_URL}/api/revalidate` (same `CRM_API_KEY`
  bearer, body `{ tag: "services" }`) to bust the site's ISR cache immediately instead of waiting
  up to 5 minutes. Needs `SITE_URL` (the site's public URL) in env — this variable exists only for
  this purpose and lives only in this repo, not in `vinifera-site`.

If leads or services stop syncing to/from the site, check `CRM_API_KEY` and `SITE_URL` first —
both are plain `process.env.*` reads with no startup validation, so a missing/mismatched value
fails silently (endpoints return 401, or the revalidation push is swallowed by its own `catch`).

## Scheduled jobs & notifications

There are **three independent schedulers** touching reminders/payments/costs — don't assume any
one of them is dead code or redundant with another; they've been deliberately split:

1. **Firebase Cloud Function `checkReminders`** (`functions/src/index.ts`) — a *separate deployable*
   with its own `functions/package.json`, built via `npm --prefix functions run build`
   (`firebase.json`'s `predeploy`) and deployed with `firebase deploy --only functions`, **not**
   part of `npm run build`/the Vercel deploy and **not** covered by this repo's CI. Runs every
   minute (`schedule: "* * * * *"`, Cloud Scheduler, region `europe-west1`) and handles: reminder
   notifications (including recurrence — it creates the next instance and closes the current one),
   installment due-soon warnings, installment overdue notifications, and fixed-cost due-soon
   notifications — plus, as of the fixed-cost automation work, it **auto-creates the matching
   `costExpenses` doc** the moment a fixed cost's exact due date arrives (guarded by
   `lastExpenseCreatedForDue` so it only fires once per due date). Secrets (`RESEND_API_KEY`,
   `RESEND_FROM_EMAIL`) are set via `firebase functions:secrets:set`, independent from this app's
   own env vars of the same name.
2. **Vercel cron `GET /api/reminders/cron`** (daily 08:00, `vercel.json`, `CRON_SECRET` bearer
   auto-injected by Vercel) — despite the name, this **no longer sends reminder notifications**
   (a comment in the route explicitly says so): it only recomputes overdue installment status and
   derives the parent payment's status from it. The actual reminder notifications are the Cloud
   Function's job now.
3. **Vercel cron `GET /api/costs/reminders`** (daily 08:00, same `CRON_SECRET` auth) — sends an
   *early*, aggregated heads-up (Telegram/email) about fixed costs due at the start of next month,
   timed `reminderDaysBefore` days ahead of the 1st. This is deliberately separate from and earlier
   than the Cloud Function's day-of fixed-cost reminder/auto-expense-generation — the two are not
   duplicates, they notify at different points in the cycle.

## UX guidelines (binding — PROJECT_SPEC.md §17)

These are enforced product conventions, not suggestions:
- **No-tab philosophy**: horizontal tabs only for genuinely alternative (non-sequential) content,
  max 4-5 of them. Otherwise use sub-routes / a secondary left rail (see client detail pages).
- Prefer **Drawer/Sheet** over new pages for quick forms; **Dialog** only for destructive/critical
  confirmations; **inline editing** (click → input → blur/Enter saves) for single fields.
- One page = one purpose + one clearly primary action (max 2 secondary, else a dropdown).
- Icons: `lucide-react` only, stroke 1.75. Motion: `framer-motion`, short durations (150–300ms),
  no bounce, respect `prefers-reduced-motion`.
- Tables: sticky header, `h-14` rows, filters persisted in the URL via `nuqs`; on mobile use a card
  list, never a horizontally-scrolling table.
- Status badges use a fixed color mapping (pending=grey, in_progress=blue, completed=green,
  cancelled=dark red, overdue=amber/red, draft=outline grey, approved=green, rejected=red,
  paid=green) — reuse it rather than inventing new colors per feature.
