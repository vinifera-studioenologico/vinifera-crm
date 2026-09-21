import { getSamples, getInProgressAnalysesSummary } from "@/server/actions/samples";
import { getClients } from "@/server/actions/clients";
import { getAnalyses } from "@/server/actions/analyses";
import { getPaymentStatusesByIds } from "@/server/actions/payments";
import { SamplesClient } from "./_components/SamplesClient";


export const dynamic = "force-dynamic";
export const metadata = { title: "Campioni — Vinifera" };

export default async function SamplesPage() {
  const [samplesResult, clientsResult, analyses, categorySummary] = await Promise.all([
    getSamples(),
    getClients(),
    getAnalyses(),
    getInProgressAnalysesSummary(),
  ]);

  const paymentIds = samplesResult.items
    .map((s) => s.paymentId)
    .filter((id): id is string => Boolean(id));
  const paymentStatuses = await getPaymentStatusesByIds(paymentIds);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <SamplesClient
        initialData={samplesResult.items}
        clients={clientsResult.items}
        analyses={analyses}
        paymentStatuses={paymentStatuses}
        categorySummary={categorySummary}
      />
    </div>
  );
}
