import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { getReport, getReportDownloadUrl } from "@/server/actions/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();

    const { id } = await params;
    const report = await getReport(id);

    if (!report) {
      return NextResponse.json({ error: "Referto non trovato" }, { status: 404 });
    }

    if (!report.pdfStorageRef) {
      return NextResponse.json({ error: "PDF non ancora generato" }, { status: 404 });
    }

    // Redirect a signed URL (1h validity)
    const url = await getReportDownloadUrl(report.pdfStorageRef);
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
