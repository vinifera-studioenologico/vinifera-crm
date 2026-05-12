import { getReports } from "@/server/actions/reports";
import { ReportsClient } from "./_components/ReportsClient";


export const dynamic = "force-dynamic";
export const metadata = { title: "Referti — Vinifera" };

export default async function ReportsPage() {
  const result = await getReports();
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <ReportsClient initialData={result.items} />
    </div>
  );
}
