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
  Actions** in `src/server/actions/`, using `firebase-admin` (`src/lib/firebase/admin.ts`). API
  routes (`src/app/api/`) are reserved for PDF generation, the Vercel cron endpoint, and webhooks —
  not general mutations.

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
