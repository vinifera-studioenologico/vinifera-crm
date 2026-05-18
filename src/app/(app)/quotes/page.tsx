import { getQuotes } from "@/server/actions/quotes";
import { getClients } from "@/server/actions/clients";
import { getAnalyses } from "@/server/actions/analyses";
import { getPackages } from "@/server/actions/packages";
import { getCompanySettings } from "@/server/actions/settings";
import { QuotesClient } from "./_components/QuotesClient";


export const dynamic = "force-dynamic";
export const metadata = { title: "Preventivi — Vinifera" };

export default async function QuotesPage() {
  const [quotesResult, clientsResult, analyses, packages, settings] = await Promise.all([
    getQuotes(),
    getClients(),
    getAnalyses(),
    getPackages(),
    getCompanySettings(),
  ]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <QuotesClient
        initialData={quotesResult.items}
        clients={clientsResult.items}
        analyses={analyses}
        packages={packages}
        defaultEnpaiaApplied={settings?.defaultEnpaiaApplied ?? false}
        defaultEnpaiaPercent={settings?.defaultEnpaiaPercent ?? 4}
      />
    </div>
  );
}
