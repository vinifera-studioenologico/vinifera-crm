import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/server/auth";
import { sendTelegramMessage } from "@/lib/notifications/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdlePingSchema = z.object({
  sampleId: z.string().min(1),
  sampleCode: z.string().min(1),
  clientName: z.string().min(1),
});

// ── Ping Telegram quando la schermata di inserimento risultati resta
// aperta un'ora senza interazioni. Autenticata dalla sessione admin, non è
// un cron né un endpoint pubblico. ────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = IdlePingSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  const { sampleId, sampleCode, clientName } = parsed.data;
  const origin = new URL(req.url).origin;

  const text = [
    "⏳ <b>Campione fermo da 1 ora</b>",
    `${sampleCode} — ${clientName}`,
    "La schermata di inserimento risultati è aperta ma non viene toccata.",
    `${origin}/samples/${sampleId}`,
  ].join("\n");

  // Non propaga l'esito: una notifica di servizio non configurata non deve
  // mostrare errori all'operatore.
  await sendTelegramMessage(text);

  return NextResponse.json({ ok: true });
}
