import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-key";
import { handleSubscribe } from "@/server/public/subscribers";

export async function POST(req: NextRequest) {
  if (!verifyApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await handleSubscribe(body, ip);
  return NextResponse.json(result.body, { status: result.status });
}
