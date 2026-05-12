import { type NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import { requireAdmin } from "@/server/auth";
import { getReport, getReportDownloadUrl } from "@/server/actions/reports";
import { getClient } from "@/server/actions/clients";
import { getSample } from "@/server/actions/samples";
import { getCompanySettings } from "@/server/actions/settings";
import { ReportPdfDocument } from "@/components/pdf/ReportPdfDocument";

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

    // Se il PDF è già su Storage, redirect a signed URL
    if (report.pdfStorageRef) {
      const url = await getReportDownloadUrl(report.pdfStorageRef);
      return NextResponse.redirect(url);
    }

    // Storage non ancora abilitato — genera il PDF al volo
    const [client, company, ...sampleResults] = await Promise.all([
      getClient(report.clientId),
      getCompanySettings(),
      ...report.sampleIds.map((sid) => getSample(sid)),
    ]);

    if (!client) {
      return NextResponse.json({ error: "Cliente non trovato" }, { status: 404 });
    }

    const samples = sampleResults.filter((s) => s !== null);

    const element = React.createElement(ReportPdfDocument, {
      reportNumber: report.number,
      company,
      client,
      samples,
      notes: report.notes,
    });

    const buffer = await renderToBuffer(element as React.ReactElement<DocumentProps>);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="referto-${report.number}.pdf"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
