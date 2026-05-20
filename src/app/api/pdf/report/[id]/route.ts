import { type NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import { requireAdmin } from "@/server/auth";
import { getReport, getReportDownloadUrl } from "@/server/actions/reports";
import { getClient } from "@/server/actions/clients";
import { getSample } from "@/server/actions/samples";
import { getCompanySettings } from "@/server/actions/settings";
import { getClientPackages } from "@/server/actions/clientPackages";
import { ReportPdfDocument } from "@/components/pdf/ReportPdfDocument";
import { ReportCommercialPdfDocument } from "@/components/pdf/ReportCommercialPdfDocument";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();

    const { id } = await params;
    const isCommercial = req.nextUrl.searchParams.get("type") === "commercial";
    const report = await getReport(id);

    if (!report) {
      return NextResponse.json({ error: "Referto non trovato" }, { status: 404 });
    }

    // Il PDF tecnico pre-generato su Storage — solo per versione tecnica
    if (!isCommercial && report.pdfStorageRef) {
      const url = await getReportDownloadUrl(report.pdfStorageRef);
      return NextResponse.redirect(url);
    }

    const [client, company, ...sampleResults] = await Promise.all([
      getClient(report.clientId),
      getCompanySettings(),
      ...report.sampleIds.map((sid) => getSample(sid)),
    ]);

    if (!client) {
      return NextResponse.json({ error: "Cliente non trovato" }, { status: 404 });
    }

    const samples = sampleResults.filter((s) => s !== null);

    const allPackages = await getClientPackages(report.clientId);
    const activePackages = allPackages.filter((p) => p.status === "active");

    const props = { reportNumber: report.number, company, client, samples, notes: report.notes, clientPackages: activePackages };
    const element = isCommercial
      ? React.createElement(ReportCommercialPdfDocument, props)
      : React.createElement(ReportPdfDocument, props);

    const buffer = await renderToBuffer(element as React.ReactElement<DocumentProps>);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

    const filename = isCommercial
      ? `referto-commerciale-${report.number}.pdf`
      : `referto-${report.number}.pdf`;

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    logger.error("Errore generazione PDF referto", err);
    const message = err instanceof Error ? err.message : "Errore";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
