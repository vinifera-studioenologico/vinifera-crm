import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/signout
 * Cancella il session cookie server-side e reindirizza al login.
 * Chiamato da requireAdmin quando il ruolo è insufficiente, così il
 * middleware non blocca il loop su /login (no cookie = nessun accesso
 * alle route protette senza nuovo login).
 */
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete("__session");
  return response;
}
