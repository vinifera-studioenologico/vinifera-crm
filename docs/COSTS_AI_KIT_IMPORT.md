# Import AI Spese + Import AI Kit da Offerta — Specifica di Implementazione

> **Documento operativo, auto-contenuto, pensato per essere eseguito da zero in una chat nuova.**
> Estende il modulo Costi già implementato (riferimento storico: `COSTS_MODULE_IMPLEMENTATION.md`).
> Stack: Next.js 16 (App Router, RSC + Client), TypeScript strict, Zod v4, Firestore (firebase-admin),
> Firebase Storage, shadcn/ui + Tailwind 4 + lucide-react, react-hook-form, sonner, recharts,
> @tanstack/react-table. Mutazioni via Server Actions (`"use server"`) o Route Handler quando c'è upload binario.
> **Lingua UI: italiano.** Importi SEMPRE in centesimi interi su Firestore.
> Ogni step si chiude con `npm run typecheck` pulito.

---

## 0. Contesto, obiettivo e stato attuale

### 0.1 Cosa esiste già (NON reinventare)
- **Parsing AI spesa singola**: `POST /api/costs/parse-invoice` → legge un PDF, chiama Claude, ritorna i dati di **una** spesa. Vedi `src/app/api/costs/parse-invoice/route.ts`.
- **Salvataggio spesa (+ PDF opzionale)**: `POST /api/costs/expenses` (FormData). Vedi `src/app/api/costs/expenses/route.ts`.
- **Uploader client**: `src/app/(app)/costs/_components/InvoiceUploader.tsx` (dropzone + stato parsing) e il suo consumer `src/app/(app)/costs/_components/NewExpenseClient.tsx`.
- **Kit a mano**: `src/components/forms/KitForm.tsx` (combobox analisi) → server actions `createKit` / `updateKit` in `src/server/actions/costs.ts`.
- **Calcoli**: `getCostsSummary` (cruscotto) e `getSuggestedPricing` (pricing per analisi) in `src/server/actions/costs.ts`.
- **Schemi**: `src/schemas/cost.ts`. **Validatori**: `src/schemas/validators.ts` (`zCents`, `zEurInput`, `zNonEmptyString`). **Money utils**: `src/lib/utils/money.ts`.

### 0.2 Obiettivo (2 funzionalità)
1. **Import AI Kit da offerta fornitore** (NUOVO). Un'offerta/preventivo contiene N righe kit (codice, descrizione, formato, q.tà, prezzo). L'AI le estrae; il sistema le associa **1:1 a un'analisi** (match deterministico server-side); l'utente rivede **tutto** in un **recap obbligatorio** che evidenzia anomalie/cloni/campi incerti; alla conferma si creano/aggiornano i kit (alimentano `costPerTestCents` di ciascuna analisi) e si registra **anche una spesa** (categoria dedicata `kit_purchase`) per la cassa, **esclusa dalla media overhead** per non contare due volte i costi kit.
2. **Import AI spese vision-first + multi-periodo** (ESTENSIONE). Gli esempi reali (`docs/examples/`) sono per 3/4 **scansioni o foto** (una bolletta **scritta a mano**), e la bolletta acqua contiene **4 periodi in un foglio**. Il parser deve: accettare **immagini** (JPEG/PNG/WEBP), non solo PDF nativi; poter restituire **N spese** da un documento; mostrare un mini-recap di conferma.

### 0.3 Decisioni confermate con l'utente (vincolanti)
- Bolletta multi-periodo → **N spese separate**, una per periodo, con la data del periodo.
- `numberOfTests` → estratto dall'offerta quando esplicito; **fallback manuale** in recap.
- **Recap obbligatorio prima di importare**: evidenzia anomalie, possibili cloni, campi non capiti dall'AI, kit già esistenti (update con delta prezzo). **Nulla viene scritto prima della conferma esplicita.**
- **Non complicare la UI**: riusare lo stile/componenti attuali (Dialog/Sheet, Table, Badge, combobox Popover+Command come in `KitForm`).

### 0.4 Convenzioni del progetto da rispettare (NON derogare)
- Importi su Firestore in **centesimi interi**. Conversione euro↔centesimi SOLO con `src/lib/utils/money.ts` (`toCents`, `fromCents`, `formatEUR`, `applyPercentCents`, `mulCentsByQty`). **Mai** aritmetica grezza su importi (vincolo PROJECT_SPEC §18.1).
- `requireAdmin()` all'inizio di **ogni** server action e route handler.
- `ActionResult<T>` come tipo di ritorno delle server action (vedi pattern in `costs.ts`).
- `FieldValue.serverTimestamp()` per `createdAt`/`updatedAt`; `FieldValue.increment(1)` per `version`.
- Soft delete con `deletedAt: null | Timestamp`. Optimistic concurrency con `version: number`.
- `tsToISO()` per convertire Timestamp → stringa ISO nei mapper `toXxxDoc`.
- `revalidatePath()` dopo ogni mutazione. `logger.info/warn/error` per logging.
- Collection Firestore top-level già in uso: `costExpenses`, `costFixedCosts`, `costKits`, `settings/costs`, `analyses`.

---

## 0.5 Prerequisiti & costanti condivise AI (LEGGERE PRIMA DI SCRIVERE CODICE)

Tutti gli endpoint AI nuovi devono usare **esattamente** la stessa configurazione di `parse-invoice` (non cambiare modello/versione senza motivo):

```typescript
// Valori ATTUALI usati in src/app/api/costs/parse-invoice/route.ts — riusarli identici:
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-opus-4-5";          // ⚠️ verificare che sia ancora valido; se l'API risponde 404 model, aggiornare all'ID più recente
const ANTHROPIC_VERSION = "2023-06-01";             // header "anthropic-version"
// header: "x-api-key": process.env.ANTHROPIC_API_KEY!
```

Regole comuni a TUTTE le route AI/upload:
- `export const runtime = "nodejs";` e `export const dynamic = "force-dynamic";` (servono firebase-admin e `file-type`, che NON girano su edge).
- `await requireAdmin()` in try/catch → 401 se fallisce.
- Validazione **magic bytes** con `fileTypeFromBuffer` (import `{ fileTypeFromBuffer } from "file-type"`): non fidarsi del mime dichiarato.
- **Limiti dimensione**:
  - PDF: max **10 MB** (limite app; l'API Anthropic regge fino a ~32 MB / 100 pagine).
  - Immagini (JPEG/PNG/WEBP): max **5 MB** (limite per-immagine dell'API Anthropic). Oltre → 413 con messaggio "Immagine troppo grande (max 5 MB): riduci la risoluzione".
- **max_tokens** della risposta Claude:
  - spese (`parse-invoice`): `4096` (come ora).
  - offerta kit (`parse-offer`): `8192` (le offerte possono avere molte righe → output JSON più lungo).
- Tutte le route AI sono **STATELESS**: leggono il file, chiamano Claude, ritornano JSON. **NON** scrivono su Storage/Firestore. La persistenza avviene solo nelle route di scrittura (`expenses`, `import-kit-offer`) al momento della conferma utente.
- Costruzione del content block in base al tipo file:
  ```typescript
  const ALLOWED = {
    "application/pdf": "document",
    "image/jpeg": "image",
    "image/png": "image",
    "image/webp": "image",
  } as const;
  type Kind = (typeof ALLOWED)[keyof typeof ALLOWED];

  const detected = await fileTypeFromBuffer(buffer);
  const kind: Kind | undefined = detected ? ALLOWED[detected.mime as keyof typeof ALLOWED] : undefined;
  if (!kind) return NextResponse.json({ error: "Formato non supportato (PDF, JPEG, PNG, WEBP)" }, { status: 400 });

  const base64 = buffer.toString("base64");
  const sourceBlock =
    kind === "document"
      ? { type: "document", source: { type: "base64", media_type: detected!.mime, data: base64 } }
      : { type: "image",    source: { type: "base64", media_type: detected!.mime, data: base64 } };
  // messages[0].content = [ sourceBlock, { type: "text", text: PROMPT } ]
  ```
- Parsing robusto della risposta: Claude a volte avvolge il JSON in ```` ```json ````. Prima di `JSON.parse`, **strippare** eventuali fence:
  ```typescript
  function extractJson(text: string): string {
    const t = text.trim();
    const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return (fenced ? fenced[1] : t).trim();
  }
  ```

---

## 1. Modello dati — modifiche a `src/schemas/cost.ts`

### 1.1 Nuova categoria spesa `kit_purchase`

```typescript
export const ExpenseCategorySchema = z.enum([
  "supplier_invoice",
  "utility",
  "maintenance",
  "consumable",
  "kit_purchase",   // ← NUOVO: acquisto kit (collegato a costKits, ESCLUSO dalla media overhead)
  "other",
]);
```

> ⚠️ Verifica che eventuali componenti che mappano `category` → label/badge (es. nelle table spese) gestiscano la nuova chiave `kit_purchase` (label suggerita: "Acquisto kit"). Cerca con grep `supplier_invoice` per trovare tutti i punti che enumerano le categorie e aggiungi la voce.

### 1.2 Tracciabilità expense ↔ kit (campi di sistema su `ExpenseDoc`)

Aggiungi a `ExpenseDocSchema` (NON al form schema):

```typescript
export const ExpenseDocSchema = ExpenseFormSchema.omit({ totalCents: true }).extend({
  id: z.string(),
  totalCents: zCents,
  pdfStoragePath: z.string().nullable().optional(),
  pdfUrl: z.string().url().nullable().optional(),
  aiParsed: z.boolean().default(false),
  aiConfidence: z.number().min(0).max(1).optional(),
  // ── NUOVO ──
  linkedKitIds: z.array(z.string()).optional(),   // id dei costKits creati/aggiornati da questa offerta
  kitOfferRef: z.string().nullable().optional(),  // n° offerta fornitore (per dedup futura)
  version: z.number().int().min(0),
  createdAt: z.any(),
  updatedAt: z.any(),
  deletedAt: z.any().nullable(),
});
```

E aggiorna il mapper `toExpenseDoc` in `src/server/actions/costs.ts` per leggerli:
```typescript
    // ...campi esistenti...
    linkedKitIds: data["linkedKitIds"],
    kitOfferRef: data["kitOfferRef"] ?? null,
```

### 1.3 Schema payload import offerta kit

Gli importi qui arrivano **già in centesimi interi** (il recap converte gli euro con `toCents` PRIMA di inviare). Quindi `zCents`, NON `zEurInput`.

> 🔎 Nota importante: gli snapshot del codice/nome analisi **NON** sono nel payload. Il route handler li ri-deriva server-side dall'`analysisId` (fonte di verità: la collection `analyses`), così il client non può inviare snapshot incoerenti.

```typescript
import { zNonEmptyString, zCents } from "./validators";

// ── Riga di import kit (post-recap, pronta alla scrittura) ────────────
export const KitImportLineSchema = z
  .object({
    action: z.enum(["create", "update"]),
    kitId: z.string().optional(),                 // richiesto se action === "update"
    expectedVersion: z.number().int().min(0).optional(), // richiesto se action === "update"
    supplierArticleCode: zNonEmptyString.max(50),
    supplierName: z.string().max(200).optional(),
    name: zNonEmptyString.max(200),
    analysisId: zNonEmptyString,                  // il server ricava code/name snapshot da qui
    numberOfTests: z.number().int().min(1).max(100000),
    lastPurchasePriceCents: zCents,               // già in centesimi (>= 0)
  })
  .refine(
    (l) => l.action === "create" || (l.kitId != null && l.expectedVersion != null),
    { message: "kitId ed expectedVersion obbligatori per update", path: ["kitId"] },
  );

// ── Dati spesa associata all'offerta ──────────────────────────────────
export const KitOfferExpenseSchema = z.object({
  description: zNonEmptyString.max(300),
  date: zNonEmptyString,                          // "YYYY-MM-DD"
  totalCents: zCents,
  supplier: z.string().max(200).optional(),
  invoiceNumber: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
});

// ── Payload completo import ───────────────────────────────────────────
export const KitOfferImportSchema = z.object({
  lines: z.array(KitImportLineSchema).min(1, "Almeno una riga da importare"),
  expense: KitOfferExpenseSchema.nullable(),      // null = non registrare la spesa (toggle nel recap, default ON)
});
export type KitImportLineValues = z.infer<typeof KitImportLineSchema>;
export type KitOfferExpenseValues = z.infer<typeof KitOfferExpenseSchema>;
export type KitOfferImportValues = z.infer<typeof KitOfferImportSchema>;
```

### 1.4 Barrel exports

`src/types/index.ts` — aggiungi:
```typescript
export type {
  KitImportLineValues,
  KitOfferExpenseValues,
  KitOfferImportValues,
} from "@/schemas/cost";
```

> ✅ `npm run typecheck` deve passare.

---

## 2. Anti doppio-conteggio — riscrittura di `getCostsSummary`

### 2.1 Il problema, in concreto
Oggi `getCostsSummary` somma **tutte** le spese del mese in `totalExpensesCents` e fa `estimatedCostPerAnalysisCents = (totalExpensesCents + totalFixedMonthlyCents) / N`. Se l'offerta kit diventa una spesa, quel costo entra in questa media **mentre è già attribuito 1:1** via `costPerTestCents` (usato da `getSuggestedPricing`). → doppio conteggio.

> ℹ️ **Nota sull'esistente (NON "correggere" oltre lo scope)**: oggi `getSuggestedPricing` calcola il costo per analisi come `kitCostPerTestCents + fixedCostQuotaCents`, cioè **NON** include affatto le spese variabili (overhead). È una scelta già presente nel codice. Questa specifica NON modifica `getSuggestedPricing`. Modifica solo `getCostsSummary` per il cruscotto. Le due viste restano con definizioni diverse (lo erano già).

### 2.2 Decisione di modellazione del KPI cruscotto
- `overheadExpensesCents` = spese del mese **escluse** quelle `kit_purchase`.
- `overheadPerAnalysisCents` = `(overheadExpensesCents + totalFixedMonthlyCents) / N`.
- `estimatedCostPerAnalysisCents` = `overheadPerAnalysisCents + avgCostPerTestCents` (overhead indiretto + costo kit medio diretto). Così il costo kit è contato **una volta sola** (via media kit), e gli acquisti kit NON gonfiano la media.
- `totalMonthlyCents` (cassa reale) resta = **tutte** le spese + fissi (invariato): serve a mostrare l'uscita reale.

> `avgCostPerTestCents` è la media non pesata su tutti i kit: è un'approssimazione accettabile per un KPI aggregato. Documentalo in un commento.

### 2.3 Funzione completa riscritta

Sostituisci il corpo di `getCostsSummary` (da dopo le `Promise.all([...])` fino al `return`) con questo. Lo `Promise.all` che carica `expensesSnap, fixedCostsSnap, kitsSnap, analysesSnap, settings` resta **invariato**.

```typescript
  // ── Spese: separa cassa totale da acquisti kit ──────────────────────
  let totalExpensesCents = 0;   // tutte le spese del mese (cassa)
  let kitPurchasesCents = 0;    // di cui category === "kit_purchase"
  for (const d of expensesSnap.docs) {
    const data = d.data();
    const amount: number = data["totalCents"] ?? 0;
    totalExpensesCents += amount;
    if (data["category"] === "kit_purchase") kitPurchasesCents += amount;
  }
  const overheadExpensesCents = totalExpensesCents - kitPurchasesCents;

  // ── Pro-rata mensile costi fissi (invariato) ────────────────────────
  const totalFixedMonthlyCents = fixedCostsSnap.docs.reduce((sum, d) => {
    const data = d.data();
    const amount: number = data["amountCents"] ?? 0;
    const freq: string = data["frequency"] ?? "monthly";
    if (freq === "monthly") return sum + amount;
    if (freq === "quarterly") return sum + Math.round(amount / 3);
    if (freq === "annual") return sum + Math.round(amount / 12);
    return sum;
  }, 0);

  // ── Cassa reale del mese (invariato) ────────────────────────────────
  const totalMonthlyCents = totalExpensesCents + totalFixedMonthlyCents;

  // ── Kit: media costo/test (spostata QUI, serve sotto) ───────────────
  const kitsCount = kitsSnap.docs.length;
  const avgCostPerTestCents =
    kitsCount > 0
      ? Math.round(
          kitsSnap.docs.reduce((sum, d) => sum + (d.data()["costPerTestCents"] ?? 0), 0) /
            kitsCount,
        )
      : 0;

  // ── Costo stimato per analisi (anti doppio-conteggio) ───────────────
  const estimated = settings.estimatedMonthlyAnalyses;
  const overheadPerAnalysisCents =
    estimated > 0 ? Math.round((overheadExpensesCents + totalFixedMonthlyCents) / estimated) : 0;
  const estimatedCostPerAnalysisCents = overheadPerAnalysisCents + avgCostPerTestCents;

  // ── Media prezzo di listino analisi attive (invariato) ──────────────
  const activeAnalyses = analysesSnap.docs;
  const averageSellingPriceCents =
    activeAnalyses.length > 0
      ? Math.round(
          activeAnalyses.reduce((sum, d) => sum + (d.data()["defaultPriceCents"] ?? 0), 0) /
            activeAnalyses.length,
        )
      : 0;

  // ── Margine medio (guardia divisione per zero) ──────────────────────
  const marginPercent =
    averageSellingPriceCents > 0
      ? Math.round(
          ((averageSellingPriceCents - estimatedCostPerAnalysisCents) / averageSellingPriceCents) *
            100,
        )
      : 0;

  return {
    totalExpensesCents,
    kitPurchasesCents,
    overheadExpensesCents,
    totalFixedMonthlyCents,
    totalMonthlyCents,
    estimatedCostPerAnalysisCents,
    overheadPerAnalysisCents,
    averageSellingPriceCents,
    marginPercent,
    kitsCount,
    avgCostPerTestCents,
  };
```

### 2.4 Interfaccia `CostsSummary` aggiornata

```typescript
export interface CostsSummary {
  totalExpensesCents: number;        // tutte le spese (cassa)
  kitPurchasesCents: number;         // ← NUOVO: di cui acquisti kit
  overheadExpensesCents: number;     // ← NUOVO: spese non-kit
  totalFixedMonthlyCents: number;
  totalMonthlyCents: number;
  estimatedCostPerAnalysisCents: number; // ora = overhead/analisi + kit medio
  overheadPerAnalysisCents: number;  // ← NUOVO
  averageSellingPriceCents: number;
  marginPercent: number;
  kitsCount: number;
  avgCostPerTestCents: number;
}
```

### 2.5 UI cruscotto
`src/app/(app)/costs/_components/CostsKpiCards.tsx`: i campi esistenti restano. **Opzionale** ma consigliato: sotto la card "Spese variabili" mostra "di cui kit: `formatEUR(kitPurchasesCents)`". Verifica che nessun consumer di `CostsSummary` si rompa (i campi nuovi sono additivi).

> ✅ `npm run typecheck` deve passare.

---

## 3. Estensione parsing spese: vision-first + multi-spesa

> ⚠️ **Breaking change controllato**: questa fase cambia il contratto di `parse-invoice` da "una spesa" a "lista di spese". Vanno aggiornati **3 file insieme**: `parse-invoice/route.ts`, `InvoiceUploader.tsx`, `NewExpenseClient.tsx`. Fai questa fase tutta in una volta e ricompila.

### 3.1 `parse-invoice/route.ts` — accetta immagini + ritorna `expenses[]`

1. **MIME/limiti**: applica `ALLOWED`, `runtime`, limiti dimensione e `sourceBlock` come in §0.5 (rimuovi il check rigido `mime !== "application/pdf"` attuale). Limite immagini 5 MB, PDF 10 MB.
2. **Nuovo contratto di risposta**:

```typescript
interface ParsedInvoiceItem {
  articleCode: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}
interface ParsedExpense {
  description: string;
  category: "supplier_invoice" | "utility" | "maintenance" | "consumable" | "other";
  supplier: string | null;
  invoiceNumber: string | null;
  date: string | null;          // "YYYY-MM-DD"
  totalCents: number | null;
  items: ParsedInvoiceItem[];
  confidence: number;           // 0..1
  notes: string | null;         // es. "periodo NOV-DIC 2025"
}
interface ParsedInvoiceResponse {
  expenses: ParsedExpense[];    // 1..N
  warnings: string[];
}
```

> Nota: `category` qui NON include `kit_purchase` (quella nasce solo dall'import offerta). Se l'AI sbaglia categoria, l'utente la corregge nel form.

3. **Prompt** (sostituisci quello attuale):

```
Analizza questo documento di spesa di un laboratorio di analisi enologiche.
Può essere una fattura, una bolla, una bolletta (luce/acqua/gas), anche SCANSIONATA o SCRITTA A MANO.
Un singolo foglio può contenere PIÙ periodi/importi distinti (es. bolletta con più bimestri):
in quel caso restituisci UNA spesa separata per ciascun periodo.

Rispondi SOLO con JSON valido, senza markdown, senza ``` e senza testo extra:
{
  "expenses": [
    {
      "description": "descrizione sintetica (es. 'Bolletta acqua nov-dic 2025')",
      "category": "utility" | "supplier_invoice" | "maintenance" | "consumable" | "other",
      "supplier": "fornitore o null",
      "invoiceNumber": "numero documento o null",
      "date": "YYYY-MM-DD (fine periodo o data documento) o null",
      "totalCents": intero in centesimi o null,
      "items": [
        { "articleCode": "o null", "description": "", "quantity": 0, "unitPriceCents": 0, "totalCents": 0 }
      ],
      "confidence": numero 0..1,
      "notes": "periodo o dettaglio o null"
    }
  ],
  "warnings": ["stringa per ciò che è illeggibile/incerto"]
}

REGOLE:
- Importi in formato italiano (1.234,56). Converti in CENTESIMI interi (×100, arrotonda).
- Se scritto a mano o dubbio: COMPILA comunque il best guess, ma ABBASSA "confidence" e aggiungi un warning.
- NON inventare dati assenti: usa null. "items" può essere [] se non ci sono righe di dettaglio.
- Categoria: "utility" per bollette luce/acqua/gas; "supplier_invoice" per bolle/fatture fornitori; altrimenti scegli la più adatta.
```

4. **Fallback errori** (parse JSON fallito o eccezione): rispondi **status 200** con
   `{ expenses: [], warnings: ["Impossibile estrarre i dati. Compilare manualmente."] }`.
   Errori HTTP: 401 (no auth), 400 (formato non valido), 413 (troppo grande), 502 (errore/limite API Claude).
5. **Sanitizzazione**: se `parsed.expenses` non è array → `[]`. Se `warnings` non è array → `[]`. Logga `expensesCount`.

### 3.2 `InvoiceUploader.tsx` — adegua tipi e callback

- Aggiorna gli export: rimpiazza `ParsedInvoice` con `ParsedExpense` + `ParsedInvoiceResponse` (mantieni l'export di `ParsedInvoiceItem`). Aggiorna il `fetch` per leggere il nuovo shape.
- La callback diventa `onParsed: (result: ParsedInvoiceResponse, file: File) => void`.
- Aggiorna il testo della card "done": mostra "N spese trovate" (`result.expenses.length`) e l'eventuale `warnings`. La `confidence` da mostrare è quella della prima spesa (o la media).
- Accetta anche immagini nell'`<input type="file">`: `accept="application/pdf,image/jpeg,image/png,image/webp"`.

### 3.3 `NewExpenseClient.tsx` — gestione 1 vs N spese

Questo file oggi assume **una** spesa (`parsedInvoice.supplier`, `.items`, ecc.). Va aggiornato:
- Stato: `const [parsed, setParsed] = useState<ParsedInvoiceResponse | null>(null)`.
- **Se `parsed.expenses.length <= 1`**: comportamento attuale → precompila il form `ExpenseForm` con `parsed.expenses[0]` (gestisci anche il caso 0 = nessuna estrazione → form vuoto + mostra `warnings`). Salvataggio invariato via `POST /api/costs/expenses` (FormData single, vedi §3.4).
- **Se `parsed.expenses.length > 1`**: mostra una **lista recap** (riusa lo stile del recap kit §7): una card per spesa con campi editabili (descrizione, categoria, data, totale in euro, note) + checkbox "importa" (default ON). Pannello `warnings` in cima. Bottone "Crea N spese" → invia in **batch** a `POST /api/costs/expenses` con il campo `expenses` (vedi §3.4).
- Mostra sempre i `warnings` se presenti.

### 3.4 `expenses/route.ts` — accetta immagini + modalità batch (upload unico)

Estendi la route esistente **mantenendo la retro-compatibilità**:

- **Allegato**: estendi il check del file da solo-PDF a PDF/immagini (§0.5), limite 5 MB immagini / 10 MB PDF, e usa l'estensione corretta nel path: `costs/invoices/{expenseId}.{ext}` dove `ext ∈ {pdf,jpg,png,webp}` (deriva da `detected.ext`).
- **Modalità single (invariata)**: se NON è presente il campo `expenses`, usa i campi singoli attuali (`description`, `category`, …) → crea 1 doc, allega 1 file, ritorna `{ id }` (201).
- **Modalità batch (NUOVA)**: se è presente il campo `expenses` (stringa JSON di un array di oggetti `ExpenseFormSchema`-compatibili), allora:
  1. `requireAdmin()`, parse del JSON, valida **ogni** elemento con `ExpenseFormSchema` (422 con `fieldErrors` indicizzati per riga se uno fallisce).
  2. **Upload unico**: se c'è il file, genera l'id del **primo** doc, carica il file una sola volta su `costs/invoices/{firstId}.{ext}` → `sharedPath`. (Evita N upload dello stesso file.)
  3. `adminDb.batch()`: per ogni spesa crea un doc in `costExpenses` con i suoi campi + `pdfStoragePath: sharedPath` (uguale per tutte) + `aiParsed: true`, `version: 0`, timestamps, `createdBy`, `deletedAt: null`.
  4. `commit()`. Su errore dopo l'upload → best-effort delete di `sharedPath`.
  5. `revalidatePath("/costs")`, `revalidatePath("/costs/expenses")`. Ritorna `{ ids: string[] }` (201).

> Importi: il client invia `totalCents` come stringa euro? **No** — coerentemente con il flusso attuale, il client invia il valore conforme a `ExpenseFormSchema` (che usa `zEurInput`, cioè **stringa euro** "1.234,56"); lo schema la trasforma in centesimi server-side. Mantieni questa coerenza anche in batch: ogni elemento di `expenses` ha `totalCents` come **stringa euro**, non come intero. (È l'unico schema del progetto che accetta euro lato server.)

### 3.5 Test manuali fase 3
- `docs/examples/bolletta acqua.jpeg` (manoscritta, multi-periodo) → attesi più `expenses` con confidence bassa + warnings.
- `docs/examples/bollettaFebbraio.pdf` e `005295349260_2 (1).pdf` (scansioni) → 1 spesa utility ciascuna.

---

## 4. Nuovo endpoint AI — `POST /api/costs/parse-offer`

Crea `src/app/api/costs/parse-offer/route.ts` modellandolo su `parse-invoice` (struttura, auth, MIME, limiti, `extractJson`, fallback). **STATELESS.**

### 4.1 Contratto di risposta

```typescript
interface ParsedOfferLine {
  articleCode: string | null;   // codice articolo fornitore
  description: string;
  format: string | null;        // formato/confezione testuale (es. "125 mL", "conf. 100 test")
  numberOfTests: number | null; // SOLO se esplicito (determinazioni/test per kit)
  quantity: number;             // q.tà acquistata
  unitPriceCents: number;       // prezzo unitario in centesimi
  lineTotalCents: number;       // totale riga in centesimi
  confidence: number;           // 0..1 per riga
}
interface ParsedOffer {
  supplier: string | null;
  offerNumber: string | null;
  date: string | null;          // "YYYY-MM-DD"
  totalCents: number | null;    // totale offerta
  lines: ParsedOfferLine[];
  confidence: number;           // globale 0..1
  warnings: string[];
}
```

### 4.2 Prompt (italiano, vision-first), `max_tokens: 8192`

```
Analizza questa offerta/preventivo di un fornitore di kit e reagenti per un laboratorio
di analisi enologiche. Il documento elenca più prodotti (righe): ciascuno ha tipicamente
codice articolo, descrizione, formato/confezione, quantità, prezzo unitario e totale riga.

Rispondi SOLO con JSON valido, senza markdown, senza ``` e senza testo extra:
{
  "supplier": "nome fornitore o null",
  "offerNumber": "numero offerta o null",
  "date": "YYYY-MM-DD o null",
  "totalCents": intero in centesimi o null,
  "lines": [
    {
      "articleCode": "codice articolo o null",
      "description": "descrizione completa del prodotto",
      "format": "formato/confezione testuale o null (es. '125 mL', 'conf. 100 test')",
      "numberOfTests": intero o null,
      "quantity": numero,
      "unitPriceCents": intero in centesimi,
      "lineTotalCents": intero in centesimi,
      "confidence": numero 0..1
    }
  ],
  "confidence": numero 0..1,
  "warnings": ["stringa per righe ambigue, totali che non quadrano, ecc."]
}

REGOLE IMPORTANTI:
- "numberOfTests" = numero di DETERMINAZIONI/TEST che il kit consente. Compilalo SOLO se
  esplicitamente indicato (es. "100 test", "100 determinazioni", "x100", "conf. 100").
  Un formato di solo VOLUME (es. "125 mL", "1 L") NON è un numero di test: in quel caso usa null.
- Importi in formato italiano (1.234,56): converti in CENTESIMI interi (×100, arrotonda).
- Verifica che unitPriceCents × quantity ≈ lineTotalCents; se non quadra, aggiungi un warning (NON correggere i numeri letti).
- NON inventare: campi assenti = null. Estrai OGNI riga prodotto, inclusi reagenti/consumabili.
```

### 4.3 Fallback e sanitizzazione
- Parse fallito/eccezione → **status 200** con shape completo:
  `{ supplier: null, offerNumber: null, date: null, totalCents: null, lines: [], confidence: 0, warnings: ["Impossibile estrarre i dati dall'offerta. Inserimento manuale."] }`.
- Sanitizza: `lines` → `[]` se non array; ogni riga: `quantity`/`unitPriceCents`/`lineTotalCents` → numeri (default 0), `numberOfTests` → intero o null, `confidence` → clamp 0..1.
- Errori HTTP come §0.5.

### 4.4 Test manuale
`docs/examples/2026-06-11_Offerta_n3994_r2.pdf` → attese più `lines` con codice/descrizione/prezzo. Verifica che `numberOfTests` sia null dove c'è solo il volume.

---

## 5. Matching analisi ↔ kit + costruzione recap (server-side)

Il match NON è affidato all'AI (codice fornitore ≠ codice interno; nomi fuzzy): è **deterministico, testabile, e mostra i possibili cloni**.

### 5.1 `src/lib/calc/kit-match.ts`

```typescript
export interface AnalysisLite { id: string; code: string; name: string; }

export interface MatchCandidate {
  analysisId: string;
  code: string;
  name: string;
  score: number; // 0..1
}
export interface MatchResult {
  best: MatchCandidate | null;
  candidates: MatchCandidate[];          // ordinati per score desc, max 5
  level: "high" | "medium" | "low";      // high ≥ 0.8 · medium ≥ 0.5 · low < 0.5
}

export function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // accenti
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter((t) => t.length > 1));
}

/** Jaccard tra due insiemi di token. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export function matchAnalysis(
  line: { articleCode: string | null; description: string; name?: string },
  analyses: AnalysisLite[],
): MatchResult {
  const lineCode = normalize(line.articleCode);
  const haystack = `${line.name ?? ""} ${line.description}`;
  const lineTokens = tokens(haystack);
  const normHaystack = normalize(haystack);

  const scored: MatchCandidate[] = analyses.map((a) => {
    // 1) match codice esatto (raro ma fortissimo)
    if (lineCode && normalize(a.code) === lineCode) {
      return { analysisId: a.id, code: a.code, name: a.name, score: 1 };
    }
    // 2) similarità sul nome
    const j = jaccard(lineTokens, tokens(a.name));
    // bonus se il nome analisi è interamente contenuto nella descrizione
    const contained = normHaystack.includes(normalize(a.name)) ? 0.25 : 0;
    const score = Math.min(1, j + contained);
    return { analysisId: a.id, code: a.code, name: a.name, score };
  });

  scored.sort((x, y) => y.score - x.score);
  const candidates = scored.slice(0, 5).filter((c) => c.score > 0);
  const best = candidates[0] ?? null;
  const level: MatchResult["level"] =
    !best ? "low" : best.score >= 0.8 ? "high" : best.score >= 0.5 ? "medium" : "low";

  return { best, candidates, level };
}
```

### 5.2 Unit test `src/lib/calc/kit-match.test.ts`
Stile `src/schemas/validators.test.ts` (vitest, `npm run test`). Almeno 4 casi:
1. **Match codice esatto** → `best.score === 1`, `level === "high"`.
2. **Match per nome** ("Kit acidità totale" vs analisi "Acidità totale") → `level` ≥ medium.
3. **Nessun match** (descrizione generica "Reagente vario") → `best === null` o `level === "low"`.
4. **Due cloni** (due analisi simili "SO2 libera"/"SO2 totale") → i primi due `candidates` con `score` ravvicinato (verifica `candidates.length >= 2`).

### 5.3 Server action `prepareKitImport` (read-only) in `costs.ts`

Arricchisce le righe AI con match + azione + blocker + anomalie. **Non scrive nulla.**

```typescript
export type KitAction = "create" | "update";

export interface KitImportRow {
  // dati estratti (editabili lato client)
  articleCode: string | null;
  description: string;
  name: string;                     // nome kit proposto (= description ripulita o articleCode)
  format: string | null;
  quantity: number;
  unitPriceCents: number;
  numberOfTests: number | null;
  // match analisi
  match: MatchResult;
  analysisId: string | null;        // pre-selezione
  analysisCode: string | null;
  analysisName: string | null;
  // stato kit esistente
  action: KitAction;                // "update" se esiste un kit con stesso supplierArticleCode, else "create"
  existingKitId: string | null;
  existingKitVersion: number | null;
  existingPriceCents: number | null;
  // completezza (disabilita l'import della riga finché non vuoto)
  blockers: string[];               // es. ["needs_analysis","needs_tests","bad_price"]
  // segnalazioni non bloccanti
  anomalies: string[];
}

export interface KitImportPreparation {
  rows: KitImportRow[];
  globalWarnings: string[];         // include i warnings dell'AI + check trasversali
}

export async function prepareKitImport(parsed: {
  lines: ParsedOfferLine[];
  warnings?: string[];
}): Promise<KitImportPreparation>
```

**Logica (ordine esatto):**
1. `await requireAdmin()`.
2. Carica in parallelo: analisi **non archiviate** (`getAnalyses({ includeArchived: false })` → filtra per `deletedAt == null`, NON per `active`; mappa in `AnalysisLite[]{ id, code, name }`) e kit esistenti (`getKits()`). ⚠️ Usa **la stessa** lista che `KitForm` passa al suo combobox, così il menu analisi del recap è identico a quello del form kit (non aggiungere un filtro `active`).
3. Costruisci `existingByCode = Map<normalize(supplierArticleCode), KitDoc>`.
4. Per ogni `line`:
   a. `name` proposto = `line.description` (trim); se vuota usa `articleCode`.
   b. `existing = existingByCode.get(normalize(line.articleCode))`.
   c. `match = matchAnalysis({ articleCode: line.articleCode, description: line.description }, analyses)`.
   d. **Pre-selezione analisi**:
      - se `existing` → usa l'analisi del kit esistente (`existing.analysisId/analysisCodeSnapshot/analysisNameSnapshot`). **Non** ri-matchare un kit già anagrafato.
      - altrimenti → se `match.level !== "low"` usa `match.best`; else `analysisId = null`.
   e. `action = existing ? "update" : "create"`.
   f. **numberOfTests**:
      - se `existing` → default = `existing.numberOfTests` (più affidabile del valore offerta).
      - altrimenti → `line.numberOfTests` (può essere null).
   g. **blockers** (rendono la riga non importabile finché non risolti):
      - `needs_analysis` se `analysisId == null`.
      - `needs_tests` se `numberOfTests == null || numberOfTests < 1`.
      - `bad_price` se `unitPriceCents <= 0`.
   h. **anomalies** (informative, non bloccano):
      - `already_exists` se `existing` (mostra delta prezzo `existing.lastPurchasePriceCents` → `unitPriceCents`).
      - `big_price_change` se `existing` e `existing.lastPurchasePriceCents > 0` e `Math.abs(unitPriceCents - existing.lastPurchasePriceCents) / existing.lastPurchasePriceCents > 0.30`.
      - `no_analysis_match` se `match.level === "low"`.
      - `ambiguous_match` se `match.candidates.length >= 2` e `candidates[0].score - candidates[1].score < 0.1` (possibili cloni).
      - `price_mismatch` se `quantity > 0` e `Math.abs(unitPriceCents * quantity - line.lineTotalCents) > 50` (tolleranza 0,50 €).
      - `low_confidence` se `line.confidence < 0.6`.
5. **Check trasversali → `globalWarnings`**:
   - `duplicate_article` : stesso `normalize(articleCode)` su più righe (lista i codici).
   - `same_analysis_multiple_lines` : due o più righe **pre-selezionate** sulla stessa `analysisId` → avviso forte (in `getSuggestedPricing` la mappa `analysisId → costPerTest` tiene solo l'ultimo: l'utente deve scegliere quale kit rappresenta quell'analisi, mettendo gli altri su "non importare" o cambiando analisi).
   - Concatena i `parsed.warnings` dell'AI.
6. Ritorna `{ rows, globalWarnings }`.

> Le stringhe dei `blockers`/`anomalies`/`globalWarnings` sono codici; la UI le traduce in messaggi leggibili (vedi §7.3 per la tabella codice→testo).

---

## 6. Scrittura import — `POST /api/costs/import-kit-offer`

Crea `src/app/api/costs/import-kit-offer/route.ts`. Esegue scritture **atomiche e version-checked** con `runTransaction` (il `batch` non può leggere → non potrebbe verificare le `version`).

### 6.1 Input (FormData)
- `payload`: JSON stringificato conforme a `KitOfferImportSchema` (§1.3).
- `file`: file offerta (PDF/immagine), **opzionale** (allegato alla spesa).

### 6.2 Flusso esatto
1. `requireAdmin()` (401 se fallisce).
2. Leggi `formData`; `JSON.parse(payload)`; valida con `KitOfferImportSchema` → 422 con `fieldErrors` se fallisce.
3. **Carica gli snapshot analisi autorevoli**: raccogli gli `analysisId` distinti dalle righe; `adminDb.getAll(...refs)` su `analyses`; costruisci `analysisById = Map<id, {code, name}>`. Se un `analysisId` non esiste o ha `deletedAt != null` (archiviata) → 422 "Analisi non valida per la riga X". (Le analisi inattive ma non archiviate sono ammesse: il combobox le include.)
4. **Genera i ref in anticipo**:
   - se `payload.expense != null`: `expenseRef = adminDb.collection("costExpenses").doc()` → `expenseId`.
   - per ogni riga `create`: `createRef = adminDb.collection("costKits").doc()` (conserva l'id, servirà per `linkedKitIds`).
5. **Upload file (solo se presente E `expense != null`)**:
   - valida magic bytes + dimensione (§0.5);
   - `storagePath = costs/invoices/{expenseId}.{ext}`; `bucket.file(storagePath).save(buffer, { metadata: { contentType, metadata: { uploadedBy, expenseId } } })`.
   - (Se file presente ma `expense == null`, ignora il file: non c'è dove allegarlo.)
6. **Transazione** `adminDb.runTransaction(async (tx) => { ... })`:
   - **Letture prima delle scritture**: per ogni riga `update`, `tx.get(costKits/{kitId})`; se `!exists` → throw `NotFound:{kitId}`; se `data.version !== expectedVersion` → throw `Conflict:{kitId}`.
   - **Scritture**:
     - riga `create` → `tx.set(createRef, kitDocShape(line, snapshot, "create"))`.
     - riga `update` → `tx.update(costKits/{kitId}, kitUpdateShape(line, snapshot))`.
     - se `expense != null` → `tx.set(expenseRef, expenseDocShape(...))`.
   - Ritorna i conteggi `{ created, updated }`.
7. **Gestione errori transazione**: cattura i throw e mappa a HTTP:
   - `Conflict:*` / `NotFound:*` → **409** con `{ error, conflictKitIds: string[] }` (la UI ricarica il recap).
   - altro → 500.
   - In **ogni** caso di errore dopo l'upload → best-effort `bucket.file(storagePath).delete()`.
8. Su successo: `revalidatePath("/costs")`, `revalidatePath("/costs/kits")`, `revalidatePath("/costs/expenses")`.
9. Risposta **201**: `{ created, updated, expenseId: expenseId ?? null }`.

### 6.3 Shape esatti dei documenti (devono combaciare con `toKitDoc`/`toExpenseDoc`)

```typescript
// costPerTest sempre intero
const costPerTestCents = Math.round(line.lastPurchasePriceCents / line.numberOfTests);
const snap = analysisById.get(line.analysisId)!; // { code, name }

// CREATE kit
const kitCreate = {
  supplierArticleCode: line.supplierArticleCode,
  supplierName: line.supplierName ?? "",
  name: line.name,
  analysisId: line.analysisId,
  analysisCodeSnapshot: snap.code,   // ⚠️ ri-derivato server-side, NON dal client
  analysisNameSnapshot: snap.name,
  numberOfTests: line.numberOfTests,
  lastPurchasePriceCents: line.lastPurchasePriceCents,
  costPerTestCents,
  version: 0,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  deletedAt: null,
  createdBy: actor.uid,
};

// UPDATE kit (optimistic concurrency)
const kitUpdate = {
  supplierName: line.supplierName ?? "",
  name: line.name,
  analysisId: line.analysisId,
  analysisCodeSnapshot: snap.code,
  analysisNameSnapshot: snap.name,
  numberOfTests: line.numberOfTests,
  lastPurchasePriceCents: line.lastPurchasePriceCents,
  costPerTestCents,
  version: FieldValue.increment(1),
  updatedAt: FieldValue.serverTimestamp(),
  updatedBy: actor.uid,
};

// EXPENSE (category kit_purchase)
const expenseDoc = {
  description: expense.description,
  category: "kit_purchase",
  supplier: expense.supplier ?? "",
  invoiceNumber: expense.invoiceNumber ?? "",
  date: expense.date,                 // "YYYY-MM-DD"
  totalCents: expense.totalCents,     // intero (già in centesimi nel payload)
  notes: expense.notes ?? "",
  items: [],
  pdfStoragePath: storagePath ?? null,
  pdfUrl: null,
  aiParsed: true,
  linkedKitIds,                       // id dei kit create (ref pre-generati) + update (line.kitId)
  kitOfferRef: expense.invoiceNumber ?? null,
  version: 0,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  deletedAt: null,
  createdBy: actor.uid,
};
```

> ⚠️ **Totale spesa**: `expense.totalCents` = totale dell'**intera offerta** (incluse eventuali righe non importate come kit): è la cassa realmente spesa. `linkedKitIds` invece contiene solo i kit effettivamente create/update. È corretto che divergano.

---

## 7. UI — Uploader + Recap import kit

> Riusa componenti shadcn esistenti. Combobox analisi: copia il pattern Popover+Command di `KitForm.tsx`.

### 7.1 Punto di ingresso
In `src/app/(app)/costs/_components/KitsTable.tsx`, nell'header (accanto a "Aggiungi kit"), aggiungi **"Importa da offerta"** che apre uno **Sheet** (o Dialog largo) con il flusso Upload → Parsing → Recap. Lo Sheet riceve `analyses: AnalysisDoc[]` (già caricate dalla pagina `kits/page.tsx`).

Nuovi componenti in `src/app/(app)/costs/_components/`:
- `KitOfferUploader.tsx` — dropzone (riusa la UX di `InvoiceUploader`) che fa `POST /api/costs/parse-offer`, poi chiama la server action `prepareKitImport(parsed)` e passa `KitImportPreparation` + `file` al recap.
- `KitImportReview.tsx` — il **recap obbligatorio**.

### 7.2 `KitImportReview` — struttura e comportamento

Mock layout:
```
┌───────────────────────────────────────────────────────────────────────────┐
│ Revisione import — Offerta n.3994 · BioAnalisi Srl · 11/06/2026             │
│ Totale offerta: € 1.234,56 · Confidence AI: 88%                             │
├───────────────────────────────────────────────────────────────────────────┤
│ ⚠️ DA CONTROLLARE (pannello sempre visibile in cima)                        │
│  • 2 righe senza analisi associata — selezionala                           │
│  • "Kit SO2": 2 analisi simili (possibile clone) — scegli quale            │
│  • "Kit acidità" già esistente: € 45,00 → € 48,00 (+6,7%)                  │
│  • Riga 4: numero test mancante — inseriscilo                              │
│  • 2 righe puntano alla stessa analisi (Acidità totale) — scegline una     │
├───────────────────────────────────────────────────────────────────────────┤
│ [✓] Cod.  Descrizione      Q.tà  P.unit.  N.test  Analisi ▼     €/test  Stato   │
│ [✓] V81.. Kit Acidità Tot.  2    € 48,00   100    [Acidità ▼]   € 0,48  Aggiorna │
│ [✓] V82.. Kit SO2 libera    1    € 60,00   100    [SO2 ▼ ⚠]     € 0,60  Clone?   │
│ [ ] R03.. Reagente generico 5    € 12,00    —     [— da assoc.] —       Ignora   │
├───────────────────────────────────────────────────────────────────────────┤
│ Riepilogo: 3 kit nuovi · 1 aggiornato · 1 ignorato · 1 spesa € 1.234,56     │
│ [✓] Registra anche la spesa (categoria: Acquisto kit)   [Annulla] [Importa] │
└───────────────────────────────────────────────────────────────────────────┘
```

Comportamento:
- **Pannello anomalie** in cima: rendi leggibili `globalWarnings` + tutti gli `anomalies`/`blockers` di riga (tabella codice→testo §7.3). Click su una voce → scroll/evidenzia la riga.
- **Tabella editabile** (stato locale `rows`, inizializzato da `preparation.rows`), una riga per `KitImportRow`:
  - **checkbox "importa"**: default ON solo se `blockers.length === 0`; OFF (e disabilitato il toggle ON) finché ci sono blockers irrisolti.
  - `articleCode`, `description` (read-only o input leggero), `quantity` (read-only).
  - **`unitPrice`**: input in euro (stringa); ricalcola `€/test` live; alla conferma → `toCents`.
  - **`numberOfTests`**: input intero; prefilled (offerta o kit esistente); risolve `needs_tests`.
  - **Analisi**: combobox Popover+Command (come `KitForm`) sulla lista `analyses`; pre-selezionato su `analysisId`; badge ⚠ se anomalia `ambiguous_match`/`no_analysis_match`; selezionare un'analisi rimuove `needs_analysis`.
  - **`€/test`** preview = `toCents(unitPrice) / numberOfTests` via `Math.round` (usa `formatEUR`).
  - **Badge stato**: `Nuovo` (verde) se `action==="create"`; `Aggiorna` (blu, tooltip col delta prezzo) se `action==="update"`; `Ignora` (grigio) se checkbox OFF; sovrapponi un mini-badge ambra `Clone?` se `ambiguous_match`.
- **Blocco bottone "Importa"**: disabilitato se esiste **almeno una riga selezionata** con `blockers` non risolti, oppure se due righe selezionate puntano alla stessa `analysisId`. Mostra il motivo accanto al bottone.
- **Riepilogo** in fondo: conteggi calcolati live + toggle "Registra anche la spesa" (default ON). Se ON, mostra/edita data e descrizione spesa (default: data offerta o oggi; descrizione = "Offerta {offerNumber} {supplier}"). `totalCents` spesa default = `parsedOffer.totalCents` (editabile), in euro.
- **Conferma** → costruisci `KitOfferImportValues`:
  - includi solo le righe con checkbox ON;
  - per ciascuna: `action` = `row.action`; se `update` aggiungi `kitId = existingKitId`, `expectedVersion = existingKitVersion`; `lastPurchasePriceCents = toCents(unitPriceInput)`; `numberOfTests` = intero; `analysisId` selezionato; `supplierArticleCode`, `supplierName`, `name`;
  - `expense` = `null` se toggle OFF, altrimenti `{ description, date, totalCents: toCents(totalInput), supplier, invoiceNumber: offerNumber, notes }`.
  - invia FormData (`payload` JSON + `file`) a `POST /api/costs/import-kit-offer`.
  - **409** → toast "Alcuni kit sono stati modificati altrove" + ri-esegui `prepareKitImport` (ricarica il recap con le version aggiornate).
  - **success** → toast "Creati X kit, aggiornati Y" (+ "spesa registrata" se presente) → chiudi Sheet → `router.refresh()`.

### 7.3 Tabella codici → testo italiano (per la UI)
| Codice | Messaggio |
|---|---|
| `needs_analysis` | "Analisi non associata — selezionala" |
| `needs_tests` | "Numero di test mancante — inseriscilo" |
| `bad_price` | "Prezzo unitario non valido" |
| `already_exists` | "Kit già presente: verrà aggiornato" |
| `big_price_change` | "Variazione di prezzo rilevante (>30%)" |
| `no_analysis_match` | "Nessuna analisi corrispondente trovata" |
| `ambiguous_match` | "Più analisi simili (possibile clone) — scegli quella giusta" |
| `price_mismatch` | "Prezzo unitario × quantità non combacia col totale riga" |
| `low_confidence` | "Lettura AI incerta su questa riga" |
| `duplicate_article` | "Codice articolo ripetuto nell'offerta" |
| `same_analysis_multiple_lines` | "Più righe sulla stessa analisi — scegline una sola" |

> Importi nel recap: visualizzazione con `formatEUR(cents)`; input editabili in stringa euro; conversione con `toCents` SOLO al submit. Mai aritmetica grezza (§18.1).

---

## 8. Visibilità & modifica del mapping analisi ↔ kit

- `KitForm` ha già il combobox analisi → modifica manuale per kit singolo già possibile. ✅
- `KitsTable`: assicurati che la colonna **"Analisi collegata"** sia presente e mostri `analysisCodeSnapshot — analysisNameSnapshot`; click riga → apre `KitForm` in edit. Se la colonna non c'è, aggiungila.
- Pagina dettaglio spesa `src/app/(app)/costs/expenses/[id]/page.tsx`: se `category === "kit_purchase"` e `linkedKitIds?.length`, mostra una sezione "Kit collegati" con i nomi (link a `/costs/kits`). Read-only, utile per tracciabilità. (Per i nomi: carica i kit con `getAll` o filtra `getKits()`.)

---

## 9. Rules, Indexes, Storage

- **Firestore rules**: nessuna nuova collection → **nessuna modifica**.
- **Firestore indexes**: nessun nuovo indice. Il filtro `category === "kit_purchase"` avviene **in memoria** dentro `getCostsSummary`, non in query (così non serve un indice composito aggiuntivo).
- **Storage**: file offerta in `costs/invoices/{expenseId}.{ext}` → già coperto dalla regola `costs/invoices/{fileName}`. **Verifica** che il pattern sia `{fileName}` (non vincolato a `.pdf`); se per caso fosse limitato all'estensione pdf, generalizzalo. `write` resta `false` (solo Admin SDK server-side).

---

## 10. Ordine di implementazione (atomico, testabile)

> Dopo OGNI step: `npm run typecheck`. Test funzionali col runner: l'utente preferisce lanciare i test e incollare l'output; non fare polling del terminale.

### Step 1 — Schema & tipi (§1)
`kit_purchase` in `ExpenseCategorySchema`; `linkedKitIds`/`kitOfferRef` in `ExpenseDocSchema` + `toExpenseDoc`; schemi import + export tipi; gestisci la nuova categoria nelle label/badge spese.

### Step 2 — Anti doppio-conteggio (§2)
Riscrivi `getCostsSummary`; estendi `CostsSummary`; adegua `CostsKpiCards` (campi additivi, opzionale "di cui kit").

### Step 3 — Matching service + test (§5.1–5.2)
`kit-match.ts` + `kit-match.test.ts`. Esegui i soli test del file.

### Step 4 — `parse-offer` (§4)
Nuova route AI. Test manuale con l'offerta esempio.

### Step 5 — `prepareKitImport` (§5.3)
Server action read-only con match/blocker/anomalie/globalWarnings.

### Step 6 — `import-kit-offer` (§6)
Route handler con `runTransaction`, version-check, snapshot server-side, upload file, cleanup.

### Step 7 — UI import kit (§7)
`KitOfferUploader` + `KitImportReview`; bottone in `KitsTable` → Sheet. Test end-to-end con l'offerta esempio.

### Step 8 — Estensione spese vision + multi-spesa (§3)
`parse-invoice` (immagini + `expenses[]`), `InvoiceUploader`, `NewExpenseClient`, `expenses/route` (immagini + batch). Test con `bolletta acqua.jpeg` e `bollettaFebbraio.pdf`.

### Step 9 — Visibilità mapping (§8)
Colonna analisi in `KitsTable` (se mancante) + sezione "Kit collegati" nel dettaglio spesa.

### Step 10 — Verifica finale
`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` puliti (o `npm run check`). Smoke test di tutti i flussi.

---

## 11. File creati / modificati

### Creati
```
src/lib/calc/kit-match.ts
src/lib/calc/kit-match.test.ts
src/app/api/costs/parse-offer/route.ts
src/app/api/costs/import-kit-offer/route.ts
src/app/(app)/costs/_components/KitOfferUploader.tsx
src/app/(app)/costs/_components/KitImportReview.tsx
```

### Modificati
```
src/schemas/cost.ts                                 → kit_purchase, linkedKitIds/kitOfferRef, schemi import + tipi
src/types/index.ts                                  → export tipi import
src/server/actions/costs.ts                         → getCostsSummary (anti doppio-conteggio) + toExpenseDoc + prepareKitImport
src/app/api/costs/parse-invoice/route.ts            → accetta immagini + risposta multi-spesa (expenses[])
src/app/api/costs/expenses/route.ts                 → accetta immagini + modalità batch (upload unico)
src/app/(app)/costs/_components/InvoiceUploader.tsx → nuovo contratto ParsedInvoiceResponse + accept immagini
src/app/(app)/costs/_components/NewExpenseClient.tsx→ gestione 1 vs N spese + recap multi-spesa
src/app/(app)/costs/_components/KitsTable.tsx       → bottone "Importa da offerta" + colonna analisi
src/app/(app)/costs/_components/CostsKpiCards.tsx   → "di cui kit" (opzionale)
src/app/(app)/costs/expenses/[id]/page.tsx          → sezione "Kit collegati" (opzionale)
```
> ⚠️ Cerca con grep eventuali ALTRI consumer di `ParsedInvoice` (il tipo cambia nome/forma) e dei campi di `CostsSummary`, e aggiornali.

---

## 12. Note tecniche, edge case e trappole

- **Importi**: sempre `money.ts`. `costPerTestCents = Math.round(price / numberOfTests)` (intero). Input euro→cent con `toCents` SOLO al submit. `ExpenseFormSchema` è l'**unico** schema che accetta euro come stringa lato server (via `zEurInput`); il payload import kit invece usa **centesimi interi** (`zCents`).
- **Snapshot analisi autorevoli**: in import-kit-offer i `analysisCodeSnapshot/analysisNameSnapshot` si ri-derivano da `analyses/{analysisId}` server-side; il client NON li invia. Evita snapshot falsificati/stantii.
- **Optimistic concurrency**: gli update kit portano `expectedVersion`; la transazione verifica e risponde **409** con `conflictKitIds`; la UI ricarica il recap.
- **Stessa analisi su più righe**: in `getSuggestedPricing` la mappa `analysisId → costPerTest` tiene solo l'ultimo kit. Quindi blocca l'import se due righe selezionate puntano alla stessa analisi (vincolo UI §7.2) e avvisa (`same_analysis_multiple_lines`).
- **Kit esistente**: in update si tiene di default `numberOfTests` esistente (più affidabile dell'offerta) e si aggiorna il prezzo → ricalcolo `costPerTestCents`. L'utente può comunque sovrascrivere `numberOfTests` nel recap.
- **`numberOfTests` vs formato**: un formato di volume ("125 mL") NON è un numero di test → l'AI lascia null → blocker `needs_tests` → fallback manuale.
- **Limiti Anthropic**: immagini max ~5 MB per-immagine; PDF ~32 MB/100 pagine (limite app 10 MB). La foto manoscritta va sotto 5 MB: se troppo grande → 413 con messaggio chiaro.
- **Risposta JSON di Claude**: può arrivare con fence ```` ```json ````: usa `extractJson` (§0.5) prima di `JSON.parse`. In caso di errore → fallback 200 con `expenses: []` / `lines: []` + warning, mai 500 "muto".
- **`max_tokens`**: 8192 per `parse-offer` (offerte lunghe); se un'offerta ha decine di righe e l'output viene troncato (`stop_reason: "max_tokens"`), aggiungi un warning "Offerta lunga: verifica che tutte le righe siano state lette".
- **Totale spesa vs kit importati**: l'expense kit_purchase ha il totale dell'intera offerta (cassa reale); `linkedKitIds` solo i kit toccati. Divergenza voluta.
- **Multi-spesa, allegato unico**: in modalità batch il file si carica una sola volta su `costs/invoices/{firstId}.{ext}` e tutte le spese condividono `pdfStoragePath`.
- **Vision su manoscritto/scansione**: confidence bassa + warning sempre; nessuna scrittura silenziosa: l'utente conferma nel recap.
- **Sicurezza (OWASP)**: `requireAdmin()` su ogni endpoint; validazione magic bytes su ogni upload; limiti dimensione; nessun PDF orfano (upload solo al confirm; cleanup su errore); nessun dato sensibile loggato; input validati con Zod ai confini.
- **Privacy AI**: i documenti (incluse bollette) vengono inviati all'API Anthropic. È un requisito esplicito del cliente; non aggiungere gating ulteriori, ma non loggare il contenuto dei file.
- **Test obbligatorio**: `kit-match.test.ts`. `typecheck` + `lint` + `build` puliti a fine implementazione (`npm run check`).
```
