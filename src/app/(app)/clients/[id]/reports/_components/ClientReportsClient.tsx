"use client";

import { useState, useTransition } from "react";
import { FileText } from "lucide-react";

import type { ReportDoc } from "@/schemas/report";
import { getReports } from "@/server/actions/reports";
import { formatDate } from "@/lib/utils/date";

import { ReportActions } from "@/components/reports/ReportActions";
import { Button } from "@/components/ui/button";
import { CsvExportButton } from "@/components/data-table/CsvExportButton";

interface Props {
  clientId: string;
  initialReports: ReportDoc[];
  hasMore: boolean;
  nextCursor: string | null;
}

export function ClientReportsClient({
  clientId,
  initialReports,
  hasMore: initialHasMore,
  nextCursor: initialCursor,
}: Props) {
  const [reports, setReports] = useState<ReportDoc[]>(initialReports);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, startLoadMore] = useTransition();

  function loadMore() {
    if (!cursor) return;
    startLoadMore(async () => {
      const result = await getReports({ clientId, cursor });
      setReports((prev) => [...prev, ...result.items]);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Referti ({reports.length}{hasMore ? "+" : ""})
        </h2>
        <CsvExportButton
          data={reports}
          columns={[
            { header: "Numero", accessor: (r: ReportDoc) => r.number },
            { header: "N. campioni", accessor: (r: ReportDoc) => String(r.sampleIds.length) },
            { header: "Generato il", accessor: (r: ReportDoc) => r.generatedAt ? formatDate(r.generatedAt as Parameters<typeof formatDate>[0]) : "" },
          ]}
          filenamePrefix="referti_cliente"
        />
      </div>

      {reports.length === 0 ? (
        <div className="rounded-xl border border-border border-dashed p-12 flex flex-col items-center gap-3 text-center">
          <FileText className="size-6 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            Nessun referto per questo cliente.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
          {reports.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{r.number}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.sampleIds.length} campion{r.sampleIds.length === 1 ? "e" : "i"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {r.generatedAt ? formatDate(r.generatedAt as Parameters<typeof formatDate>[0]) : "—"}
                </p>
              </div>
              <ReportActions report={r} className="flex items-center gap-1 shrink-0" />
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoadingMore}>
            {isLoadingMore ? "Caricamento..." : "Carica altri"}
          </Button>
        </div>
      )}
    </div>
  );
}
