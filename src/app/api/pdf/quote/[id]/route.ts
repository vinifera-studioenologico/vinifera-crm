import { type NextRequest, NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import React from "react";

import { requireAdmin } from "@/server/auth";
import { getQuote } from "@/server/actions/quotes";
import { getCompanySettings } from "@/server/actions/settings";
import { QuotePdfDocument } from "@/components/pdf/QuotePdfDocument";
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

    const [quote, company] = await Promise.all([
      getQuote(id),
      getCompanySettings(),
    ]);

    if (!quote) {
      return NextResponse.json({ error: "Preventivo non trovato" }, { status: 404 });
    }

    const element = React.createElement(QuotePdfDocument, { quote, company });
    const buffer = await renderToBuffer(element as React.ReactElement<DocumentProps>);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

    const filename = `preventivo-${quote.number.replace("/", "-")}.pdf`;

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    logger.error("Errore generazione PDF preventivo", err);
    const message = err instanceof Error ? err.message : "Errore generazione PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
