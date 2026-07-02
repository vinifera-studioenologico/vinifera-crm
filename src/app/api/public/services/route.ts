import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-key";
import { getPublicServices } from "@/server/public/services";

export async function GET(req: NextRequest) {
  if (!verifyApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const services = await getPublicServices();
    return NextResponse.json(services, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("[API] GET /api/public/services error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
