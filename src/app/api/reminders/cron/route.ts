import { type NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { logger } from "@/lib/logger";
import {
  derivePaymentStatus,
  type InstallmentForCalc,
} from "@/lib/calc/payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Protetto da Authorization: Bearer <CRON_SECRET> (iniettato da Vercel automaticamente)
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

// ── Cron giornaliero: aggiorna overdue installments ───────────────────
// Le notifiche dei promemoria sono gestite dalla Firebase Cloud Function
// `checkReminders` che gira ogni minuto (vedi functions/src/index.ts).
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Timestamp.now();

  try {
    // ── Aggiorna overdue installments ─────────────────────────────────
    const cutoff = Timestamp.fromDate(new Date(now.toDate().setHours(0, 0, 0, 0)));
    const overdueInstallSnap = await adminDb
      .collectionGroup("installments")
      .where("status", "==", "pending")
      .where("dueAt", "<", cutoff)
      .get();

    const batch = adminDb.batch();
    const paymentIds = new Set<string>();

    for (const instDoc of overdueInstallSnap.docs) {
      batch.update(instDoc.ref, {
        status: "overdue",
        updatedAt: FieldValue.serverTimestamp(),
      });
      const paymentId = instDoc.ref.parent.parent?.id;
      if (paymentId) paymentIds.add(paymentId);
    }

    if (overdueInstallSnap.docs.length > 0) await batch.commit();

    // Aggiorna status pagamento usando derivePaymentStatus
    for (const paymentId of paymentIds) {
      const payRef = adminDb.collection("payments").doc(paymentId);
      const [paySnap, installSnap] = await Promise.all([
        payRef.get(),
        adminDb
          .collection("payments")
          .doc(paymentId)
          .collection("installments")
          .get(),
      ]);
      if (!paySnap.exists) continue;
      const payData = paySnap.data()!;
      const currentPayStatus = payData["status"] as string;
      if (currentPayStatus === "paid" || currentPayStatus === "cancelled") continue;

      const installmentsForCalc: InstallmentForCalc[] = installSnap.docs.map((d) => ({
        status: overdueInstallSnap.docs.some((od) => od.id === d.id)
          ? "overdue"
          : (d.data()["status"] as InstallmentForCalc["status"]),
        dueDate: (d.data()["dueAt"] as Timestamp).toDate(),
        amountCents: (d.data()["amountCents"] as number) ?? 0,
      }));

      const newStatus = derivePaymentStatus(
        {
          totalAmountCents: (payData["totalAmountCents"] as number) ?? 0,
          paidAmountCents: (payData["paidAmountCents"] as number) ?? 0,
          cancelled: false,
        },
        installmentsForCalc,
      );

      if (newStatus !== currentPayStatus) {
        await payRef.update({
          status: newStatus,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    logger.info("Cron installments completed", {
      overdueInstallments: overdueInstallSnap.docs.length,
    });

    return NextResponse.json({
      ok: true,
      overdueInstallments: overdueInstallSnap.docs.length,
    });
  } catch (err) {
    logger.error("Cron installments failed", { err });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
