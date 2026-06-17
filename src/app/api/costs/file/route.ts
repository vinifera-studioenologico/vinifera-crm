import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { adminStorage } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * GET /api/costs/file?path=costs/invoices/abc.pdf
 *
 * Proxy autenticato per file in Firebase Storage.
 * Serve il file con Content-Disposition: inline e Content-Type corretto,
 * risolvendo il problema di download forzato dei signed URL.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const storagePath = req.nextUrl.searchParams.get("path");
  if (!storagePath || !storagePath.startsWith("costs/")) {
    return NextResponse.json({ error: "Path non valido" }, { status: 400 });
  }

  try {
    const bucket = adminStorage.bucket();
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json({ error: "File non trovato" }, { status: 404 });
    }

    const [buffer] = await file.download();
    const ext = storagePath.split(".").pop()?.toLowerCase() ?? "pdf";
    const contentType = MIME_MAP[ext] ?? "application/octet-stream";

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("Errore proxy file:", err);
    return NextResponse.json({ error: "Errore lettura file" }, { status: 500 });
  }
}
