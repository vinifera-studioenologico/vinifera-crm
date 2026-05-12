import { notFound } from "next/navigation";
import { getClient } from "@/server/actions/clients";
import { getClientPackages } from "@/server/actions/clientPackages";
import { getPackages } from "@/server/actions/packages";
import { ClientPackagesClient } from "./_components/ClientPackagesClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClientPackagesPage({ params }: Props) {
  const { id } = await params;
  const [client, clientPackages, packageTemplates] = await Promise.all([
    getClient(id),
    getClientPackages(id),
    getPackages(),
  ]);

  if (!client) notFound();

  return (
    <div className="p-4 md:p-6">
      <ClientPackagesClient
        client={client}
        initialPackages={clientPackages}
        packageTemplates={packageTemplates}
      />
    </div>
  );
}
