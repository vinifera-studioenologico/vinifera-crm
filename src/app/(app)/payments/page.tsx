import { getPayments } from "@/server/actions/payments";
import { PaymentsClient } from "./_components/PaymentsClient";


export const dynamic = "force-dynamic";
export const metadata = { title: "Pagamenti — Vinifera" };

export default async function PaymentsPage() {
  const result = await getPayments();

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <PaymentsClient initialData={result.items} />
    </div>
  );
}
