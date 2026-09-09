import { notFound } from "next/navigation";
import { getClient } from "@/server/actions/clients";
import { getReports } from "@/server/actions/reports";
import { getReportSummaries } from "@/server/actions/reportSummaries";
import { ClientReportsClient } from "./_components/ClientReportsClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClientReportsPage({ params }: Props) {
  const { id } = await params;
  const [client, reportsResult, summariesResult] = await Promise.all([
    getClient(id),
    getReports({ clientId: id }),
    getReportSummaries({ clientId: id }),
  ]);

  if (!client) notFound();

  return (
    <div className="p-4 md:p-6">
      <ClientReportsClient
        clientId={id}
        initialReports={reportsResult.items}
        hasMore={reportsResult.hasMore}
        nextCursor={reportsResult.nextCursor}
        initialSummaries={summariesResult.items}
        summariesHasMore={summariesResult.hasMore}
        summariesNextCursor={summariesResult.nextCursor}
      />
    </div>
  );
}
