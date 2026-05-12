import { NextResponse, type NextRequest } from "next/server";

// Protegge tutte le route sotto (app)
const PROTECTED_PATHS = [
  "/dashboard",
  "/clients",
  "/analyses",
  "/packages",
  "/samples",
  "/quotes",
  "/reports",
  "/payments",
  "/reminders",
  "/stats",
  "/settings",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Dev bypass ─────────────────────────────────────────────────────────────
  // Con NEXT_PUBLIC_DEV_BYPASS_AUTH=true il middleware considera l'utente sempre
  // autenticato. Non serve Firebase né un vero cookie di sessione.
  const devBypass = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";
  if (devBypass) {
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }
  // ───────────────────────────────────────────────────────────────────────────

  const session = request.cookies.get("__session")?.value;

  // Utente autenticato sulla landing → redirect al dashboard
  if (pathname === "/" && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
