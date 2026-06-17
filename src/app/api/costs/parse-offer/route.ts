import { type NextRequest, NextResponse } from "next/server";
import { fileTypeFromBuffer } from "file-type";
import { requireAdmin } from "@/server/auth";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Costanti AI (speculari a parse-invoice) ───────────────────────────
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-opus-4-5";
const ANTHROPIC_VERSION = "2023-06-01";

const MAX_PDF_SIZE = 10 * 1024 * 1024;   // 10 MB
const MAX_IMG_SIZE = 5 * 1024 * 1024;    // 5 MB

const ALLOWED = {
  "application/pdf": "document",
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
} as const;
type Kind = (typeof ALLOWED)[keyof typeof ALLOWED];

// ── Tipi contratto ────────────────────────────────────────────────────
export interface ParsedOfferLine {
  articleCode: string | null;
  description: string;
  format: string | null;
  numberOfTests: number | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  confidence: number;
}

export interface ParsedOffer {
  supplier: string | null;
  offerNumber: string | null;
  date: string | null;
  totalCents: number | null;
  lines: ParsedOfferLine[];
  confidence: number;
  warnings: string[];
}

// ── Helper: strip fence markdown ─────────────────────────────────────
function extractJson(text: string): string {
  const t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1]! : t).trim();
}

// ── Fallback ─────────────────────────────────────────────────────────
const FALLBACK: ParsedOffer = {
  supplier: null,
  offerNumber: null,
  date: null,
  totalCents: null,
  lines: [],
  confidence: 0,
  warnings: ["Impossibile estrarre i dati dall'offerta. Inserimento manuale."],
};

const PROMPT = `Analizza questa offerta/preventivo di un fornitore di kit e reagenti per un laboratorio
di analisi enologiche. Il documento elenca più prodotti (righe): ciascuno ha tipicamente
codice articolo, descrizione, formato/confezione, quantità, prezzo unitario e totale riga.

Rispondi SOLO con JSON valido, senza markdown, senza \`\`\` e senza testo extra:
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
- NON inventare: campi assenti = null. Estrai OGNI riga prodotto, inclusi reagenti/consumabili.`;

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  // ── FormData ──────────────────────────────────────────────────────
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

  // ── Buffer + magic bytes ──────────────────────────────────────────
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

  // ── Limiti dimensione ─────────────────────────────────────────────
  const maxSize = kind === "document" ? MAX_PDF_SIZE : MAX_IMG_SIZE;
  if (buffer.length > maxSize) {
    const msg =
      kind === "image"
        ? "Immagine troppo grande (max 5 MB): riduci la risoluzione"
        : "Il file supera il limite di 10 MB";
    return NextResponse.json({ error: msg }, { status: 413 });
  }

  // ── API key ───────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.error("ANTHROPIC_API_KEY non configurata");
    return NextResponse.json(
      { error: "Parsing AI non disponibile (chiave API mancante)" },
      { status: 503 },
    );
  }

  // ── Costruzione sourceBlock ───────────────────────────────────────
  const base64 = buffer.toString("base64");
  const sourceBlock =
    kind === "document"
      ? { type: "document", source: { type: "base64", media_type: detected!.mime, data: base64 } }
      : { type: "image", source: { type: "base64", media_type: detected!.mime, data: base64 } };

  // ── Chiamata Claude ───────────────────────────────────────────────
  let parsed: ParsedOffer;
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
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: [sourceBlock, { type: "text", text: PROMPT }],
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
      logger.error("Errore API Claude (parse-offer)", { status: response.status, body: errBody });
      return NextResponse.json(
        { error: "Errore del servizio AI. Riprova tra poco." },
        { status: 502 },
      );
    }

    const claudeData = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
      stop_reason?: string;
    };

    const textBlock = claudeData.content.find((c) => c.type === "text");
    if (!textBlock?.text) {
      throw new Error("Nessun testo nella risposta Claude");
    }

    parsed = JSON.parse(extractJson(textBlock.text)) as ParsedOffer;

    // Avviso output troncato
    if (claudeData.stop_reason === "max_tokens") {
      if (!Array.isArray(parsed.warnings)) parsed.warnings = [];
      parsed.warnings.push(
        "Offerta lunga: verifica che tutte le righe siano state lette (risposta AI troncata).",
      );
    }
  } catch (err) {
    logger.error("Errore parsing risposta Claude (parse-offer)", err);
    return NextResponse.json(FALLBACK, { status: 200 });
  }

  // ── Sanitizzazione ────────────────────────────────────────────────
  if (!Array.isArray(parsed.lines)) parsed.lines = [];
  if (!Array.isArray(parsed.warnings)) parsed.warnings = [];

  parsed.lines = parsed.lines.map((l) => ({
    articleCode: l.articleCode ?? null,
    description: String(l.description ?? ""),
    format: l.format ?? null,
    numberOfTests:
      l.numberOfTests != null && Number.isInteger(l.numberOfTests) && l.numberOfTests > 0
        ? l.numberOfTests
        : null,
    quantity: typeof l.quantity === "number" ? l.quantity : 0,
    unitPriceCents: typeof l.unitPriceCents === "number" ? Math.round(l.unitPriceCents) : 0,
    lineTotalCents: typeof l.lineTotalCents === "number" ? Math.round(l.lineTotalCents) : 0,
    confidence: typeof l.confidence === "number" ? Math.max(0, Math.min(1, l.confidence)) : 0,
  }));

  parsed.confidence =
    typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0;

  logger.info("Offerta kit analizzata", {
    supplier: parsed.supplier,
    linesCount: parsed.lines.length,
    confidence: parsed.confidence,
  });

  return NextResponse.json(parsed);
}
