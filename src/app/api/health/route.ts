export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const start = Date.now();
  let firestoreOk = false;

  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    await adminDb.collection("settings").doc("company").get();
    firestoreOk = true;
  } catch {
    /* noop */
  }

  const status = firestoreOk ? "pass" : "fail";
  const statusCode = firestoreOk ? 200 : 503;

  const isAuthed =
    req.headers.get("authorization") ===
    `Bearer ${process.env.CRON_SECRET}`;

  const body = isAuthed
    ? {
        status,
        checks: {
          firestore: {
            status: firestoreOk ? "pass" : "fail",
            latency: Date.now() - start,
          },
        },
      }
    : { status };

  return Response.json(body, {
    status: statusCode,
    headers: { "Cache-Control": "no-store" },
  });
}
