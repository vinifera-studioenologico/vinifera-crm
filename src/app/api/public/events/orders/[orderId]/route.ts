import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-key";
import { adminDb } from "@/lib/firebase/admin";

interface Context {
  params: Promise<{ orderId: string }>;
}

export async function GET(req: NextRequest, { params }: Context) {
  if (!verifyApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { orderId } = await params;
    const snap = await adminDb.collection("eventOrders").doc(orderId).get();

    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data = snap.data()!;

    return NextResponse.json(
      {
        status: data["status"] ?? "unknown",
        event_title: data["eventSnapshot"]?.titleIt ?? "",
        seats: data["seats"] ?? 0,
        order_number: data["orderNumber"] ?? "",
        total_cents: data["totalCents"] ?? 0,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[API] GET /api/public/events/orders/[orderId] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
