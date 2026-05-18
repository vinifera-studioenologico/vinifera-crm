import { notFound } from "next/navigation";
import { getClient } from "@/server/actions/clients";
import { getQuotes } from "@/server/actions/quotes";
import { getAnalyses } from "@/server/actions/analyses";
import { getPackages } from "@/server/actions/packages";
import { getCompanySettings } from "@/server/actions/settings";
import { ClientQuotesClient } from "./_components/ClientQuotesClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClientQuotesPage({ params }: Props) {
  const { id } = await params;
  const [client, quotesResult, analyses, packages, settings] = await Promise.all([
    getClient(id),
    getQuotes({ clientId: id }),
    getAnalyses(),
    getPackages(),
    getCompanySettings(),
  ]);

  if (!client) notFound();

  return (
    <div className="p-4 md:p-6">
      <ClientQuotesClient
        client={client}
        initialQuotes={quotesResult.items}
        analyses={analyses}
        packages={packages}
        defaultEnpaiaApplied={settings?.defaultEnpaiaApplied ?? false}
        defaultEnpaiaPercent={settings?.defaultEnpaiaPercent ?? 4}
      />
    </div>
  );
}
