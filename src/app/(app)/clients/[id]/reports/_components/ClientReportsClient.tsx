"use client";

import { useState, useTransition } from "react";
import { FileText, Layers } from "lucide-react";
import { toast } from "sonner";

import type { ReportDoc } from "@/schemas/report";
import type { ReportSummaryDoc } from "@/schemas/reportSummary";
import { getReports } from "@/server/actions/reports";
import { createReportSummary, getReportSummaries } from "@/server/actions/reportSummaries";
import { formatDate } from "@/lib/utils/date";
import { formatEUR } from "@/lib/utils/money";

import { ReportActions } from "@/components/reports/ReportActions";
import { ReportSummaryActions } from "@/components/reports/ReportSummaryActions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CsvExportButton } from "@/components/data-table/CsvExportButton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const MAX_REPORTS_PER_SUMMARY = 50;

interface Props {
  clientId: string;
  initialReports: ReportDoc[];
  hasMore: boolean;
  nextCursor: string | null;
  initialSummaries: ReportSummaryDoc[];
  summariesHasMore: boolean;
  summariesNextCursor: string | null;
}

export function ClientReportsClient({
  clientId,
  initialReports,
  hasMore: initialHasMore,
  nextCursor: initialCursor,
  initialSummaries,
  summariesHasMore: initialSummariesHasMore,
  summariesNextCursor: initialSummariesCursor,
}: Props) {
  const [reports, setReports] = useState<ReportDoc[]>(initialReports);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, startLoadMore] = useTransition();

  const [summaries, setSummaries] = useState<ReportSummaryDoc[]>(initialSummaries);
  const [summariesCursor, setSummariesCursor] = useState<string | null>(initialSummariesCursor);
  const [summariesHasMore, setSummariesHasMore] = useState(initialSummariesHasMore);
  const [isLoadingMoreSummaries, startLoadMoreSummaries] = useTransition();

  // Selezione referti da riepilogare
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [summaryNotes, setSummaryNotes] = useState("");
  const [isCreating, startCreate] = useTransition();

  function loadMore() {
    if (!cursor) return;
    startLoadMore(async () => {
      const result = await getReports({ clientId, cursor });
      setReports((prev) => [...prev, ...result.items]);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    });
  }

  function loadMoreSummaries() {
    if (!summariesCursor) return;
    startLoadMoreSummaries(async () => {
      const result = await getReportSummaries({ clientId, cursor: summariesCursor });
      setSummaries((prev) => [...prev, ...result.items]);
      setSummariesCursor(result.nextCursor);
      setSummariesHasMore(result.hasMore);
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function handleCreateSummary() {
    // Preserva l'ordine di visualizzazione (più recente prima), non l'ordine
    // di click sulle checkbox.
    const reportIds = reports.filter((r) => selected.has(r.id)).map((r) => r.id);
    startCreate(async () => {
      const result = await createReportSummary({ clientId, reportIds, notes: summaryNotes || undefined });
      if (result.success) {
        toast.success(`Referto riepilogativo ${result.data.number} generato`);
        setDialogOpen(false);
        clearSelection();
        setSummaryNotes("");
        // Ricarica la prima pagina dei riepilogativi per mostrare quello appena creato
        const refreshed = await getReportSummaries({ clientId });
        setSummaries(refreshed.items);
        setSummariesCursor(refreshed.nextCursor);
        setSummariesHasMore(refreshed.hasMore);
      } else {
        toast.error(result.error);
      }
    });
  }

  const selectedReports = reports.filter((r) => selected.has(r.id));

  return (
    <div className="space-y-8">
      {/* ── Referti ──────────────────────────────────────────────────── */}
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

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <p className="text-sm text-foreground">
              {selected.size} referto{selected.size === 1 ? "" : "i"} selezionat{selected.size === 1 ? "o" : "i"}
              {selected.size === 1 && " — selezionane almeno un altro per riepilogare"}
              {selected.size > MAX_REPORTS_PER_SUMMARY && ` — massimo ${MAX_REPORTS_PER_SUMMARY}`}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Annulla selezione
              </Button>
              <Button
                size="sm"
                disabled={selected.size < 2 || selected.size > MAX_REPORTS_PER_SUMMARY}
                onClick={() => setDialogOpen(true)}
              >
                <Layers className="size-3.5" strokeWidth={1.75} />
                Genera referto riepilogativo
              </Button>
            </div>
          </div>
        )}

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
                <Checkbox
                  checked={selected.has(r.id)}
                  onCheckedChange={() => toggleSelect(r.id)}
                  aria-label={`Seleziona referto ${r.number}`}
                />
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

      {/* ── Referti riepilogativi ────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">
          Referti riepilogativi ({summaries.length}{summariesHasMore ? "+" : ""})
        </h2>

        {summaries.length === 0 ? (
          <div className="rounded-xl border border-border border-dashed p-12 flex flex-col items-center gap-3 text-center">
            <Layers className="size-6 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">
              Nessun referto riepilogativo generato — seleziona almeno due referti sopra.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
            {summaries.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{s.number}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.reportIds.length} referti inclusi
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.generatedAt ? formatDate(s.generatedAt as Parameters<typeof formatDate>[0]) : "—"}
                  </p>
                </div>
                <span className="text-sm font-medium tabular-nums shrink-0">
                  {formatEUR(s.totalCents)}
                </span>
                <ReportSummaryActions summary={s} className="flex items-center gap-1 shrink-0" />
              </div>
            ))}
          </div>
        )}

        {summariesHasMore && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={loadMoreSummaries} disabled={isLoadingMoreSummaries}>
              {isLoadingMoreSummaries ? "Caricamento..." : "Carica altri"}
            </Button>
          </div>
        )}
      </div>

      {/* Dialog conferma generazione riepilogo */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && setDialogOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Genera referto riepilogativo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Verrà creato un unico PDF con il riepilogo dei seguenti {selectedReports.length} referti
              (campioni inclusi) e il totale complessivo:
            </p>
            <ul className="rounded-lg border border-border divide-y divide-border max-h-40 overflow-y-auto">
              {selectedReports.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{r.number}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.sampleIds.length} campion{r.sampleIds.length === 1 ? "e" : "i"}
                  </span>
                </li>
              ))}
            </ul>
            <div className="space-y-1.5">
              <Label>Note aggiuntive (opzionale)</Label>
              <Textarea
                rows={3}
                className="resize-none"
                value={summaryNotes}
                onChange={(e) => setSummaryNotes(e.target.value)}
                placeholder="Note da includere nel referto riepilogativo..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button disabled={isCreating} onClick={handleCreateSummary}>
              {isCreating ? "Generazione..." : "Genera referto riepilogativo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
