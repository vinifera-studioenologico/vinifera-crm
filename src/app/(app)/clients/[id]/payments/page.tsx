import { notFound } from "next/navigation";
import { getClient } from "@/server/actions/clients";
import { getClientPayments } from "@/server/actions/payments";
import { ClientPaymentsClient } from "./_components/ClientPaymentsClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClientPaymentsPage({ params }: Props) {
  const { id } = await params;
  const [client, payments] = await Promise.all([
    getClient(id),
    getClientPayments(id),
  ]);

  if (!client) notFound();

  return (
    <div className="p-4 md:p-6">
      <ClientPaymentsClient
        client={client}
        initialPayments={payments}
      />
    </div>
  );
}
