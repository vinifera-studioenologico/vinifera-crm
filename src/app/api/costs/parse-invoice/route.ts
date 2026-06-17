import { type NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { requireAdmin } from "@/server/auth";
import { adminDb } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-opus-4-5";
const ANTHROPIC_VERSION = "2023-06-01";

const MAX_PDF_SIZE = 10 * 1024 * 1024;
const MAX_IMG_SIZE = 5 * 1024 * 1024;

const ALLOWED = {
  "application/pdf": "document",
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
} as const;
type Kind = (typeof ALLOWED)[keyof typeof ALLOWED];

// ── Contratto di risposta ─────────────────────────────────────────────
export interface ParsedInvoiceItem {
  articleCode: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface ParsedExpense {
  description: string;
  category: "supplier_invoice" | "utility" | "maintenance" | "consumable" | "other";
  supplier: string | null;
  invoiceNumber: string | null;
  date: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  totalCents: number | null;
  items: ParsedInvoiceItem[];
  confidence: number;
  notes: string | null;
}

export interface ParsedInvoiceResponse {
  expenses: ParsedExpense[];
  warnings: string[];
  fileHash: string;
  duplicateExpenseIds: string[];
}

const FALLBACK: ParsedInvoiceResponse = {
  expenses: [],
  warnings: ["Impossibile estrarre i dati. Compilare manualmente."],
  fileHash: "",
  duplicateExpenseIds: [],
};

function extractJson(text: string): string {
  const t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1]! : t).trim();
}

const PROMPT = (today: string, fileName: string) => `Analizza questo documento di spesa di un laboratorio di analisi enologiche.
Può essere una fattura, una bolla, una bolletta (luce/acqua/gas), anche SCANSIONATA o SCRITTA A MANO.
Un singolo foglio può contenere PIÙ periodi/importi distinti (es. bolletta con più bimestri):
in quel caso restituisci UNA spesa separata per ciascun periodo.

Data di oggi: ${today}
Nome file originale: "${fileName}" (usa come indizio per determinare fornitore e tipo di spesa)

Rispondi SOLO con JSON valido, senza markdown, senza \`\`\` e senza testo extra:
{
  "expenses": [
    {
      "description": "descrizione sintetica (es. 'Bolletta acqua nov-dic 2025')",
      "category": "utility" | "supplier_invoice" | "maintenance" | "consumable" | "other",
      "supplier": "OBBLIGATORIO, mai null. Titolo breve: fornitore + tipo (es. 'Edison - Luce', 'Italgas - Gas', 'Registrazione EA - Acqua'). Deduci dal contenuto o dal nome file.",
      "invoiceNumber": "numero documento o null",
      "date": "YYYY-MM-DD (fine periodo o data documento)",
      "periodFrom": "YYYY-MM-DD inizio periodo coperto o null (solo per bollette/periodi)",
      "periodTo": "YYYY-MM-DD fine periodo coperto o null (solo per bollette/periodi)",
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
- NON inventare dati assenti: usa null per i campi che non riesci a determinare TRANNE "date".
- "items" può essere [] se non ci sono righe di dettaglio.
- Categoria: "utility" per bollette luce/acqua/gas; "supplier_invoice" per bolle/fatture fornitori; altrimenti scegli la più adatta.
- REGOLA DATA (obbligatorio, mai null): se conosci giorno e mese ma non l'anno, scegli l'anno così:
  usa l'anno corrente se il mese del periodo è ≤ mese corrente, altrimenti usa l'anno precedente.
  Esempio: oggi è ${today}, il periodo è NOV-DIC → ${today.slice(0, 4)}-12 < oggi? no → anno ${parseInt(today.slice(0, 4)) - 1}.
  Se non riesci a determinare nemmeno il mese, usa la data di oggi (${today}).`;

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const formData = await req.formData();
    const f = formData.get("file");
    if (!f || typeof f === "string") {
      return NextResponse.json({ error: "Nessun file ricevuto" }, { status: 400 });
    }
    file = f as File;
  } catch {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const detected = await fileTypeFromBuffer(buffer);

  const kind: Kind | undefined = detected
    ? ALLOWED[detected.mime as keyof typeof ALLOWED]
    : undefined;

  if (!kind) {
    return NextResponse.json(
      { error: "Formato non supportato (PDF, JPEG, PNG, WEBP)" },
      { status: 400 },
    );
  }

  const maxSize = kind === "document" ? MAX_PDF_SIZE : MAX_IMG_SIZE;
  if (buffer.length > maxSize) {
    const msg =
      kind === "image"
        ? "Immagine troppo grande (max 5 MB): riduci la risoluzione"
        : "Il file supera il limite di 10 MB";
    return NextResponse.json({ error: msg }, { status: 413 });
  }

  // ── Hash file per dedup ───────────────────────────────────────────
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  let duplicateExpenseIds: string[] = [];
  try {
    const dupeSnap = await adminDb
      .collection("costExpenses")
      .where("deletedAt", "==", null)
      .where("fileHash", "==", fileHash)
      .select()
      .get();
    duplicateExpenseIds = dupeSnap.docs.map((d) => d.id);
  } catch (err) {
    logger.warn("Controllo duplicati fallito", err);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.error("ANTHROPIC_API_KEY non configurata");
    return NextResponse.json(
      { error: "Parsing AI non disponibile (chiave API mancante)" },
      { status: 503 },
    );
  }

  const base64 = buffer.toString("base64");
  const sourceBlock =
    kind === "document"
      ? { type: "document", source: { type: "base64", media_type: detected!.mime, data: base64 } }
      : { type: "image", source: { type: "base64", media_type: detected!.mime, data: base64 } };

  let parsed: ParsedInvoiceResponse;
  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [sourceBlock, { type: "text", text: PROMPT(new Date().toISOString().slice(0, 10), file.name) }],
          },
        ],
      }),
    });

    if (response.status === 429) {
      return NextResponse.json(
        { error: "Limite richieste AI raggiunto. Riprova tra qualche secondo." },
        { status: 502 },
      );
    }

    if (!response.ok) {
      const errBody = await response.text();
      logger.error("Errore API Claude", { status: response.status, body: errBody });
      return NextResponse.json(
        { error: "Errore del servizio AI. Riprova tra poco." },
        { status: 502 },
      );
    }

    const claudeData = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
    };

    const textBlock = claudeData.content.find((c) => c.type === "text");
    if (!textBlock?.text) {
      throw new Error("Nessun testo nella risposta Claude");
    }

    parsed = JSON.parse(extractJson(textBlock.text)) as ParsedInvoiceResponse;
  } catch (err) {
    logger.error("Errore parsing risposta Claude", err);
    return NextResponse.json(FALLBACK, { status: 200 });
  }

  // ── Sanitizzazione ────────────────────────────────────────────────
  if (!Array.isArray(parsed.expenses)) parsed.expenses = [];
  if (!Array.isArray(parsed.warnings)) parsed.warnings = [];

  parsed.expenses = parsed.expenses.map((e) => ({
    description: String(e.description ?? ""),
    category: (["supplier_invoice", "utility", "maintenance", "consumable", "other"].includes(
      e.category,
    )
      ? e.category
      : "other") as ParsedExpense["category"],
    supplier: e.supplier ?? null,
    invoiceNumber: e.invoiceNumber ?? null,
    date: e.date ?? null,
    periodFrom: e.periodFrom ?? null,
    periodTo: e.periodTo ?? null,
    totalCents: typeof e.totalCents === "number" ? Math.round(e.totalCents) : null,
    items: Array.isArray(e.items) ? e.items : [],
    confidence: typeof e.confidence === "number" ? Math.max(0, Math.min(1, e.confidence)) : 0,
    notes: e.notes ?? null,
  }));

  logger.info("Documento spesa analizzato", {
    expensesCount: parsed.expenses.length,
    warningsCount: parsed.warnings.length,
  });

  return NextResponse.json({ ...parsed, fileHash, duplicateExpenseIds });
}
