import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-key";
import { getPublicEvents } from "@/server/public/events";

export async function GET(req: NextRequest) {
  if (!verifyApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const events = await getPublicEvents();
    return NextResponse.json(events, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("[API] GET /api/public/events error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
