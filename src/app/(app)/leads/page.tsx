import { getLeads } from "@/server/actions/leads";
import { LeadsClient } from "./_components/LeadsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lead — Vinifera" };

export default async function LeadsPage() {
  const result = await getLeads();

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <LeadsClient
        initialData={result.items}
        hasMore={result.hasMore}
        nextCursor={result.nextCursor}
      />
    </div>
  );
}
