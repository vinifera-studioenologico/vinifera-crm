import { type NextRequest, NextResponse } from "next/server";
import { fileTypeFromBuffer } from "file-type";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/server/auth";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";
import { KitOfferImportSchema } from "@/schemas/cost";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PDF_SIZE = 10 * 1024 * 1024;
const MAX_IMG_SIZE = 5 * 1024 * 1024;

const ALLOWED = {
  "application/pdf": "document",
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
} as const;
type Kind = (typeof ALLOWED)[keyof typeof ALLOWED];

const KITS_COL = "costKits";
const EXPENSES_COL = "costExpenses";

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────
  let actor: { uid: string; email: string };
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  // ── FormData ──────────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  // ── Valida payload ────────────────────────────────────────────────
  const rawPayload = formData.get("payload");
  if (!rawPayload || typeof rawPayload !== "string") {
    return NextResponse.json({ error: "Payload mancante" }, { status: 400 });
  }

  let payloadJson: unknown;
  try {
    payloadJson = JSON.parse(rawPayload);
  } catch {
    return NextResponse.json({ error: "Payload non valido (JSON malformato)" }, { status: 400 });
  }

  const payloadParsed = KitOfferImportSchema.safeParse(payloadJson);
  if (!payloadParsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of payloadParsed.error.issues) {
      const path = issue.path.map((p) => String(p)).join(".");
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path]!.push(issue.message);
    }
    return NextResponse.json({ error: "Dati non validi", fieldErrors }, { status: 422 });
  }

  const { lines, expense } = payloadParsed.data;

  // ── Carica snapshot analisi (fonte di verità server-side) ─────────
  const analysisIds = [...new Set(lines.map((l) => l.analysisId).filter(Boolean))] as string[];
  const analysisRefs = analysisIds.map((id) => adminDb.collection("analyses").doc(id));
  const analysisDocs = analysisIds.length > 0 ? await adminDb.getAll(...analysisRefs) : [];

  const analysisById = new Map<string, { code: string; name: string }>();
  for (const doc of analysisDocs) {
    if (!doc.exists || doc.data()?.["deletedAt"] != null) {
      const idx = analysisIds.indexOf(doc.id);
      return NextResponse.json(
        { error: `Analisi non valida per la riga ${idx}` },
        { status: 422 },
      );
    }
    analysisById.set(doc.id, {
      code: String(doc.data()!["code"] ?? ""),
      name: String(doc.data()!["name"] ?? ""),
    });
  }

  // ── Genera ref in anticipo ────────────────────────────────────────
  const expenseRef = expense != null ? adminDb.collection(EXPENSES_COL).doc() : null;
  const expenseId = expenseRef?.id ?? null;

  const createRefs = new Map<number, FirebaseFirestore.DocumentReference>();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.action === "create") {
      createRefs.set(i, adminDb.collection(KITS_COL).doc());
    }
  }

  // ── Upload file (solo se presente e c'è una spesa) ────────────────
  let storagePath: string | null = null;
  const rawFile = formData.get("file");
  const hasFile = rawFile && typeof rawFile !== "string" && (rawFile as File).size > 0;

  if (hasFile && expense != null && expenseId) {
    const file = rawFile as File;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const detected = await fileTypeFromBuffer(buffer);

    const kind: Kind | undefined = detected
      ? ALLOWED[detected.mime as keyof typeof ALLOWED]
      : undefined;

    if (!kind) {
      return NextResponse.json(
        { error: "Formato file non supportato (PDF, JPEG, PNG, WEBP)" },
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

    const ext = detected!.ext;
    storagePath = `costs/invoices/${expenseId}.${ext}`;
    const bucket = adminStorage.bucket();
    await bucket.file(storagePath).save(buffer, {
      metadata: {
        contentType: detected!.mime,
        metadata: { uploadedBy: actor.uid, expenseId },
      },
    });
    logger.info("File offerta kit caricato", { expenseId, storagePath });
  }

  // ── Transazione ───────────────────────────────────────────────────
  let created = 0;
  let updated = 0;

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      // Letture prima delle scritture (version-check per ogni update)
      for (const line of lines) {
        if (line.action === "update" && line.kitId) {
          const kitRef = adminDb.collection(KITS_COL).doc(line.kitId);
          const kitSnap = await tx.get(kitRef);
          if (!kitSnap.exists) throw new Error(`NotFound:${line.kitId}`);
          if (kitSnap.data()!["version"] !== line.expectedVersion) {
            throw new Error(`Conflict:${line.kitId}`);
          }
        }
      }

      // linkedKitIds: raccogli tutti gli id kit toccati
      const linkedKitIds: string[] = [];

      // Scritture
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const snap = line.analysisId ? analysisById.get(line.analysisId) : null;
        const costPerTestCents = Math.round(line.lastPurchasePriceCents / line.numberOfTests);

        if (line.action === "create") {
          const ref = createRefs.get(i)!;
          linkedKitIds.push(ref.id);
          tx.set(ref, {
            supplierArticleCode: line.supplierArticleCode,
            supplierName: line.supplierName ?? "",
            name: line.name,
            analysisId: line.analysisId ?? null,
            analysisCodeSnapshot: snap?.code ?? null,
            analysisNameSnapshot: snap?.name ?? null,
            numberOfTests: line.numberOfTests,
            lastPurchasePriceCents: line.lastPurchasePriceCents,
            costPerTestCents,
            version: 0,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            deletedAt: null,
            createdBy: actor.uid,
          });
          created++;
        } else {
          // update
          const kitRef = adminDb.collection(KITS_COL).doc(line.kitId!);
          linkedKitIds.push(line.kitId!);
          tx.update(kitRef, {
            supplierName: line.supplierName ?? "",
            name: line.name,
            analysisId: line.analysisId ?? null,
            analysisCodeSnapshot: snap?.code ?? null,
            analysisNameSnapshot: snap?.name ?? null,
            numberOfTests: line.numberOfTests,
            lastPurchasePriceCents: line.lastPurchasePriceCents,
            costPerTestCents,
            version: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: actor.uid,
          });
          updated++;
        }
      }

      // Spesa associata
      if (expense != null && expenseRef) {
        tx.set(expenseRef, {
          description: expense.description,
          category: "kit_purchase",
          supplier: expense.supplier ?? "",
          invoiceNumber: expense.invoiceNumber ?? "",
          date: expense.date,
          totalCents: expense.totalCents,
          notes: expense.notes ?? "",
          items: [],
          pdfStoragePath: storagePath,
          pdfUrl: null,
          aiParsed: true,
          linkedKitIds,
          kitOfferRef: expense.invoiceNumber ?? null,
          version: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          deletedAt: null,
          createdBy: actor.uid,
        });
      }

      return { created, updated };
    });

    revalidatePath("/costs");
    revalidatePath("/costs/kits");
    revalidatePath("/costs/expenses");
    logger.info("Import kit offerta completato", {
      created: result.created,
      updated: result.updated,
      expenseId,
    });

    return NextResponse.json(
      { created: result.created, updated: result.updated, expenseId },
      { status: 201 },
    );
  } catch (err) {
    // Best-effort cleanup file caricato
    if (storagePath) {
      try {
        await adminStorage.bucket().file(storagePath).delete();
      } catch {
        /* best effort */
      }
    }

    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("Conflict:") || msg.startsWith("NotFound:")) {
      const conflictKitIds = [msg.split(":")[1]!];
      return NextResponse.json(
        { error: "Alcuni kit sono stati modificati altrove. Ricarica il recap.", conflictKitIds },
        { status: 409 },
      );
    }

    logger.error("Errore import kit offerta", err);
    return NextResponse.json({ error: "Errore durante il salvataggio" }, { status: 500 });
  }
}
