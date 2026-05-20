import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { buildEmailHtml } from "@/lib/email";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string };
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email non valida" }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@vinifera.app";

    if (!apiKey) {
      logger.error("RESEND_API_KEY non configurata — invio reset password fallito");
      return NextResponse.json({ error: "Servizio email non disponibile" }, { status: 503 });
    }

    // Genera il link di reset tramite Firebase Admin — non invia nulla, solo il link
    let resetLink: string;
    try {
      resetLink = await adminAuth.generatePasswordResetLink(email);
    } catch (err: unknown) {
      // Se l'email non esiste in Firebase rispondiamo comunque ok (anti-enumeration)
      const code = (err as { code?: string }).code;
      if (code === "auth/email-not-found" || code === "auth/user-not-found") {
        return NextResponse.json({ ok: true });
      }
      throw err;
    }

    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const { error } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: "Reimposta la tua password — Vinifera",
      text: `Ciao,\n\nHai richiesto di reimpostare la password del tuo account Vinifera.\n\nClicca sul link seguente per scegliere una nuova password:\n${resetLink}\n\nSe non hai effettuato questa richiesta, puoi ignorare questa email.\n\nIl team Vinifera`,
      html: buildEmailHtml({
        title: "Reimposta la tua password",
        body: `
          <p>Ciao,</p>
          <p>Hai richiesto di reimpostare la password del tuo account Vinifera.</p>
          <p style="margin:24px 0;">
            <a href="${resetLink}"
               style="display:inline-block;background:#145a44;color:#ffffff;
                      text-decoration:none;padding:12px 28px;border-radius:8px;
                      font-weight:600;font-size:14px;">
              Reimposta password
            </a>
          </p>
          <p style="font-size:13px;color:#6b7280;">
            In alternativa, copia e incolla questo link nel browser:<br/>
            <a href="${resetLink}" style="color:#145a44;word-break:break-all;">${resetLink}</a>
          </p>
          <p>Se non hai effettuato questa richiesta, puoi ignorare questa email.</p>
        `,
        footerNote: "Il link scade dopo 1 ora.",
      }),
    });

    if (error) {
      logger.error("Resend password-reset error", error);
      return NextResponse.json({ error: "Errore invio email" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("password-reset route error", err);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
