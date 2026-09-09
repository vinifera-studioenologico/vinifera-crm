import { getSamples } from "@/server/actions/samples";
import { getClient } from "@/server/actions/clients";
import { getAnalyses } from "@/server/actions/analyses";
import { getPaymentStatusesByIds } from "@/server/actions/payments";
import { notFound } from "next/navigation";
import { ClientSamplesClient } from "./_components/ClientSamplesClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClientSamplesPage({ params }: Props) {
  const { id } = await params;
  const [client, samplesResult, analyses] = await Promise.all([
    getClient(id),
    getSamples({ clientId: id }),
    getAnalyses(),
  ]);

  if (!client) notFound();

  const paymentIds = samplesResult.items
    .map((s) => s.paymentId)
    .filter((pid): pid is string => Boolean(pid));
  const paymentStatuses = await getPaymentStatusesByIds(paymentIds);

  return (
    <div className="p-4 md:p-6">
      <ClientSamplesClient
        client={client}
        initialSamples={samplesResult.items}
        analyses={analyses}
        paymentStatuses={paymentStatuses}
      />
    </div>
  );
}
