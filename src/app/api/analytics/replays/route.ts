import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { listRecordings, replayUrl, personUrl } from "@/server/posthog/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const recs = await listRecordings(20);
    return NextResponse.json({
      recordings: recs.map((r) => ({
        id: r.id,
        person: r.person?.name ?? r.distinct_id ?? "Anonimo",
        distinctId: r.distinct_id,
        duration: r.recording_duration,
        startTime: r.start_time,
        startUrl: r.start_url,
        clicks: r.click_count,
        replayUrl: replayUrl(r.id),
        personUrl: r.distinct_id ? personUrl(r.distinct_id) : null,
      })),
    });
  } catch (err) {
    console.error("[analytics/replays] PostHog error:", err);
    return NextResponse.json(
      { error: "posthog_error", detail: String(err) },
      { status: 502 },
    );
  }
}
