import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-key";
import { getEventAvailability } from "@/server/public/events";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Context) {
  if (!verifyApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const availability = await getEventAvailability(id);

    if (!availability) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // no-store: questa risposta non deve mai essere cachata — è la fonte di verità
    // per il branch checkout (gratuito vs pagamento) e per la disponibilità posti.
    return NextResponse.json(availability, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[API] GET /api/public/events/[id]/availability error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
