import { NextRequest, NextResponse } from "next/server";

// URL del servizio esterno — verrà configurato in AB_SUPPORT_URL
const EXTERNAL_URL = process.env.AB_SUPPORT_URL ?? "";
const API_KEY = process.env.AB_SUPPORT_TOKEN ?? "";

export async function POST(req: NextRequest) {
  if (!EXTERNAL_URL) {
    return NextResponse.json(
      { error: "support_not_configured" },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(EXTERNAL_URL, {
      method: "POST",
      headers: { "X-API-Key": API_KEY },
      body: formData,
    });
  } catch {
    return NextResponse.json({ error: "network_error" }, { status: 502 });
  }

  if (res.status === 201) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = { error: "unknown_error" };
  }

  return NextResponse.json(body, { status: res.status });
}
