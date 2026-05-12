import { NextRequest, NextResponse } from "next/server";
import { createSessionCookie, revokeSession } from "@/server/auth";
import { adminAuth } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";

// POST /api/auth/session — crea session cookie dopo login client
export async function POST(request: NextRequest) {
  try {
    const { idToken } = (await request.json()) as { idToken: string };
    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json({ error: "idToken mancante" }, { status: 400 });
    }

    const sessionCookie = await createSessionCookie(idToken);
    const SEVEN_DAYS = 60 * 60 * 24 * 7;

    const response = NextResponse.json({ ok: true });
    response.cookies.set("__session", sessionCookie, {
      maxAge: SEVEN_DAYS,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return response;
  } catch (err) {
    logger.error("Creazione session cookie fallita", err);
    return NextResponse.json({ error: "Sessione non valida" }, { status: 401 });
  }
}

// DELETE /api/auth/session — logout, revoca token
export async function DELETE(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("__session")?.value;
    if (sessionCookie) {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie).catch(() => null);
      if (decoded) {
        await revokeSession(decoded.uid);
      }
    }
  } catch (err) {
    logger.warn("Errore revoca sessione (continuiamo comunque)", err);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete("__session");
  return response;
}
