import { getAnalyses } from "@/server/actions/analyses";
import { AnalysesClient } from "./_components/AnalysesClient";


export const dynamic = "force-dynamic";
export const metadata = { title: "Listino analisi — Vinifera" };

export default async function AnalysesPage() {
  // Carica tutte le analisi (attive + archiviate) per il toggle lato client
  const data = await getAnalyses({ includeArchived: true });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <AnalysesClient initialData={data} />
    </div>
  );
}
