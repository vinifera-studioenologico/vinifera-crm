import { type NextRequest, NextResponse } from "next/server";
import ReactPDF, { type DocumentProps } from "@react-pdf/renderer";
import React from "react";

import { requireAdmin } from "@/server/auth";
import { getQuote } from "@/server/actions/quotes";
import { getCompanySettings } from "@/server/actions/settings";
import { QuotePdfDocument } from "@/components/pdf/QuotePdfDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();

    const { id } = await params;

    const [quote, company] = await Promise.all([
      getQuote(id),
      getCompanySettings(),
    ]);

    if (!quote) {
      return NextResponse.json({ error: "Preventivo non trovato" }, { status: 404 });
    }

    const element = React.createElement(QuotePdfDocument, { quote, company });
    const buffer = await ReactPDF.renderToBuffer(element as React.ReactElement<DocumentProps>);

    const filename = `preventivo-${quote.number.replace("/", "-")}.pdf`;

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore generazione PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
