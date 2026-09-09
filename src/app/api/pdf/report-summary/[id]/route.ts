import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { renderReportSummaryPdf } from "@/server/actions/reportSummaries";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();

    const { id } = await params;
    const rendered = await renderReportSummaryPdf(id);

    if (!rendered) {
      return NextResponse.json({ error: "Referto riepilogativo non trovato" }, { status: 404 });
    }

    const { buffer, summary } = rendered;
    const clientSlug = summary.clientSnapshot.displayName.replace(/\s+/g, '_').replace(/[/\\:*?"<>|]/g, '');
    const filename = `referto-riepilogativo-${summary.number}_${clientSlug}.pdf`;
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    logger.error("Errore generazione PDF referto riepilogativo", err);
    const message = err instanceof Error ? err.message : "Errore";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
