import { getSamples } from "@/server/actions/samples";
import { getClients } from "@/server/actions/clients";
import { getAnalyses } from "@/server/actions/analyses";
import { SamplesClient } from "./_components/SamplesClient";


export const dynamic = "force-dynamic";
export const metadata = { title: "Campioni — Vinifera" };

export default async function SamplesPage() {
  const [samplesResult, clientsResult, analyses] = await Promise.all([
    getSamples(),
    getClients(),
    getAnalyses(),
  ]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <SamplesClient
        initialData={samplesResult.items}
        clients={clientsResult.items}
        analyses={analyses}
      />
    </div>
  );
}
