import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import {
  getTraffic,
  getKpis,
  getTopPages,
  getTopServices,
  getSources,
  getLanguageSplit,
} from "@/server/posthog/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = Number(req.nextUrl.searchParams.get("days"));
  const days = ([7, 30, 90].includes(raw) ? raw : 30) as 7 | 30 | 90;

  try {
    const [traffic, kpis, topPages, topServices, sources, languages] = await Promise.all([
      getTraffic(days),
      getKpis(days),
      getTopPages(days),
      getTopServices(days),
      getSources(days),
      getLanguageSplit(days),
    ]);
    return NextResponse.json({ traffic, kpis, topPages, topServices, sources, languages });
  } catch (err) {
    console.error("[analytics] PostHog error:", err);
    return NextResponse.json(
      { error: "posthog_error", detail: String(err) },
      { status: 502 },
    );
  }
}
