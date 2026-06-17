import { type NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/server/auth";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";
import { ExpenseFormSchema } from "@/schemas/cost";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PDF_SIZE = 10 * 1024 * 1024;
const MAX_IMG_SIZE = 5 * 1024 * 1024;
const EXPENSES_COL = "costExpenses";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function POST(req: NextRequest) {
  let actor: { uid: string; email: string };
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  // ── MODALITÀ BATCH (campo "expenses" presente) ────────────────────
  const expensesField = formData.get("expenses");
  if (expensesField && typeof expensesField === "string") {
    let rawExpenses: unknown[];
    try {
      rawExpenses = JSON.parse(expensesField) as unknown[];
      if (!Array.isArray(rawExpenses)) throw new Error("not array");
    } catch {
      return NextResponse.json({ error: "Campo expenses non valido (JSON malformato)" }, { status: 400 });
    }

    // Valida ogni elemento
    const parsed: ReturnType<typeof ExpenseFormSchema.parse>[] = [];
    const batchFieldErrors: Record<string, Record<string, string[]>> = {};
    for (let i = 0; i < rawExpenses.length; i++) {
      const result = ExpenseFormSchema.safeParse(rawExpenses[i]);
      if (!result.success) {
        const errs: Record<string, string[]> = {};
        for (const issue of result.error.issues) {
          const path = issue.path.map((p) => String(p)).join(".");
          if (!errs[path]) errs[path] = [];
          errs[path]!.push(issue.message);
        }
        batchFieldErrors[String(i)] = errs;
      } else {
        parsed.push(result.data);
      }
    }
    if (Object.keys(batchFieldErrors).length > 0) {
      return NextResponse.json(
        { error: "Dati non validi in alcune spese", fieldErrors: batchFieldErrors },
        { status: 422 },
      );
    }

    // Upload unico del file (se presente)
    let sharedPath: string | null = null;
    const pdfFile = formData.get("pdf");
    if (pdfFile && typeof pdfFile !== "string" && (pdfFile as File).size > 0) {
      const file = pdfFile as File;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const detected = await fileTypeFromBuffer(buffer);

      if (!detected || !ALLOWED_MIME.has(detected.mime)) {
        return NextResponse.json({ error: "Formato file non supportato" }, { status: 400 });
      }
      const maxSize = detected.mime === "application/pdf" ? MAX_PDF_SIZE : MAX_IMG_SIZE;
      if (buffer.length > maxSize) {
        return NextResponse.json({ error: "File troppo grande" }, { status: 413 });
      }

      // Genera l'id del primo doc per il path
      const firstRef = adminDb.collection(EXPENSES_COL).doc();
      sharedPath = `costs/invoices/${firstRef.id}.${detected.ext}`;
      const bucket = adminStorage.bucket();
      await bucket.file(sharedPath).save(buffer, {
        metadata: {
          contentType: detected.mime,
          metadata: { uploadedBy: actor.uid },
        },
      });
      logger.info("File spesa batch caricato", { sharedPath, count: parsed.length });
    }

    try {
      const batch = adminDb.batch();
      const ids: string[] = [];
      const fileHash = formData.get("fileHash");
      for (const data of parsed) {
        const { totalCents, ...rest } = data;
        const docRef = adminDb.collection(EXPENSES_COL).doc();
        ids.push(docRef.id);
        batch.set(docRef, {
          ...rest,
          totalCents,
          pdfStoragePath: sharedPath,
          pdfUrl: null,
          aiParsed: true,
          fileHash: typeof fileHash === "string" && fileHash ? fileHash : null,
          version: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          deletedAt: null,
          createdBy: actor.uid,
        });
      }
      await batch.commit();

      revalidatePath("/costs");
      revalidatePath("/costs/expenses");
      logger.info("Spese batch create", { count: parsed.length });
      return NextResponse.json({ ids }, { status: 201 });
    } catch (err) {
      logger.error("Errore batch spese", err);
      if (sharedPath) {
        try { await adminStorage.bucket().file(sharedPath).delete(); } catch { /* best effort */ }
      }
      return NextResponse.json({ error: "Errore durante il salvataggio" }, { status: 500 });
    }
  }

  // ── MODALITÀ SINGLE (originale) ───────────────────────────────────
  const raw = {
    description: formData.get("description"),
    category: formData.get("category"),
    supplier: formData.get("supplier") ?? undefined,
    invoiceNumber: formData.get("invoiceNumber") ?? undefined,
    date: formData.get("date"),
    periodFrom: formData.get("periodFrom") || undefined,
    periodTo: formData.get("periodTo") || undefined,
    totalCents: formData.get("totalCents"),
    notes: formData.get("notes") ?? undefined,
    items: (() => {
      const s = formData.get("items");
      if (!s || typeof s !== "string") return undefined;
      try { return JSON.parse(s); } catch { return undefined; }
    })(),
  };

  const parsedSingle = ExpenseFormSchema.safeParse(raw);
  if (!parsedSingle.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsedSingle.error.issues) {
      const path = issue.path.map((p) => String(p)).join(".");
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path]!.push(issue.message);
    }
    return NextResponse.json({ error: "Dati non validi", fieldErrors }, { status: 422 });
  }

  const { totalCents, ...rest } = parsedSingle.data;

  // ── Compute file hash for single mode ──
  let fileHash: string | null = null;
  const fileHashField = formData.get("fileHash");
  if (typeof fileHashField === "string" && fileHashField) {
    fileHash = fileHashField;
  }

  const docRef = adminDb.collection(EXPENSES_COL).doc();
  const expenseId = docRef.id;

  let pdfStoragePath: string | null = null;
  const pdfFile = formData.get("pdf");

  if (pdfFile && typeof pdfFile !== "string" && (pdfFile as File).size > 0) {
    const file = pdfFile as File;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const detected = await fileTypeFromBuffer(buffer);

    if (!detected || !ALLOWED_MIME.has(detected.mime)) {
      return NextResponse.json({ error: "Formato file allegato non supportato" }, { status: 400 });
    }

    const maxSize = detected.mime === "application/pdf" ? MAX_PDF_SIZE : MAX_IMG_SIZE;
    if (buffer.length > maxSize) {
      const msg =
        detected.mime !== "application/pdf"
          ? "Immagine troppo grande (max 5 MB)"
          : "Il file supera il limite di 10 MB";
      return NextResponse.json({ error: msg }, { status: 413 });
    }

    const storagePath = `costs/invoices/${expenseId}.${detected.ext}`;
    const bucket = adminStorage.bucket();
    await bucket.file(storagePath).save(buffer, {
      metadata: {
        contentType: detected.mime,
        metadata: { uploadedBy: actor.uid, expenseId },
      },
    });
    pdfStoragePath = storagePath;
    if (!fileHash) {
      fileHash = createHash("sha256").update(buffer).digest("hex");
    }
    logger.info("File spesa caricato", { expenseId, storagePath });
  }

  try {
    await docRef.set({
      ...rest,
      totalCents,
      pdfStoragePath,
      pdfUrl: null,
      aiParsed: pdfStoragePath !== null,
      fileHash,
      version: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deletedAt: null,
      createdBy: actor.uid,
    });

    revalidatePath("/costs");
    revalidatePath("/costs/expenses");
    logger.info("Spesa creata", { id: expenseId });
    return NextResponse.json({ id: expenseId }, { status: 201 });
  } catch (err) {
    logger.error("Errore creazione spesa", err);
    if (pdfStoragePath) {
      try { await adminStorage.bucket().file(pdfStoragePath).delete(); } catch { /* best effort */ }
    }
    return NextResponse.json({ error: "Errore durante il salvataggio" }, { status: 500 });
  }
}
