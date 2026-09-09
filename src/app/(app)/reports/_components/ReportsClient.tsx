"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, FileText } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import type { ReportDoc } from "@/schemas/report";
import { getReports, searchReports } from "@/server/actions/reports";
import { formatDate } from "@/lib/utils/date";
import { DataTable } from "@/components/data-table/DataTable";
import { CsvExportButton } from "@/components/data-table/CsvExportButton";
import { ReportActions } from "@/components/reports/ReportActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

interface Props {
  initialData: ReportDoc[];
  hasMore: boolean;
  nextCursor: string | null;
}

export function ReportsClient({ initialData, hasMore: initialHasMore, nextCursor: initialCursor }: Props) {
  const router = useRouter();
  const [reports, setReports] = useState<ReportDoc[]>(initialData);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [search, setSearch] = useState("");

  // Ricerca su tutto lo storico (server-side, debounce), non solo sui referti
  // già caricati in pagina — vedi searchReports().
  const [searchResults, setSearchResults] = useState<ReportDoc[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQueryRef = useRef("");

  const [isLoadingMore, startLoadMore] = useTransition();

  function loadMore() {
    if (!cursor) return;
    startLoadMore(async () => {
      const result = await getReports({ cursor });
      setReports((prev) => [...prev, ...result.items]);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    });
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const trimmed = value.trim();
    latestQueryRef.current = trimmed;

    if (!trimmed) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimerRef.current = setTimeout(() => {
      searchReports(trimmed).then((results) => {
        if (latestQueryRef.current !== trimmed) return; // risposta obsoleta, ignora
        setSearchResults(results);
        setIsSearching(false);
      });
    }, 300);
  }

  const isActivelySearching = search.trim().length > 0;
  // Con ricerca attiva mostriamo i risultati di searchReports() (tutto lo
  // storico); altrimenti la lista paginata caricata finora.
  const filtered = isActivelySearching ? (searchResults ?? []) : reports;

  const columns: ColumnDef<ReportDoc>[] = [
    {
      accessorKey: "number",
      header: "Numero",
      size: 130,
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.original.number}</span>
      ),
    },
    {
      id: "client",
      header: "Cliente",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.clientSnapshot.displayName}</p>
          {row.original.clientSnapshot.email && (
            <p className="text-xs text-muted-foreground">
              {row.original.clientSnapshot.email}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "samples",
      header: "Campioni",
      size: 90,
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">{row.original.sampleIds.length}</span>
      ),
    },
    {
      id: "generatedAt",
      header: "Generato il",
      size: 130,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.generatedAt
            ? formatDate(row.original.generatedAt as Parameters<typeof formatDate>[0])
            : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      size: 100,
      cell: ({ row }) => <ReportActions report={row.original} />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="min-w-0">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Referti</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Referti
          </h1>
        </div>
        <Button onClick={() => router.push("/reports/new")} className="w-full md:w-auto">
          <Plus className="size-3.5" strokeWidth={1.75} />
          Nuovo referto
        </Button>
      </div>

      {/* Ricerca */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Cerca per numero o cliente..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-8"
          />
        </div>
        <CsvExportButton
          data={filtered}
          columns={[
            { header: "Numero", accessor: (r: ReportDoc) => r.number },
            { header: "Cliente", accessor: (r: ReportDoc) => r.clientSnapshot.displayName },
            { header: "Email cliente", accessor: (r: ReportDoc) => r.clientSnapshot.email ?? "" },
            { header: "N. campioni", accessor: (r: ReportDoc) => String(r.sampleIds.length) },
            { header: "Generato il", accessor: (r: ReportDoc) => r.generatedAt ? formatDate(r.generatedAt as Parameters<typeof formatDate>[0]) : "" },
          ]}
          filenamePrefix="referti"
        />
      </div>

      {/* Tabella / empty */}
      {filtered.length === 0 && !isActivelySearching ? (
        <div className="rounded-xl border border-border bg-card p-16 flex flex-col items-center gap-3 text-center">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center">
            <FileText className="size-5 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-foreground">Nessun referto</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Genera il primo referto selezionando i campioni completati.
          </p>
          <Button size="sm" onClick={() => router.push("/reports/new")}>
            Nuovo referto
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          loading={isActivelySearching && isSearching}
          emptyMessage="Nessun referto trovato."
        />
      )}

      {!isActivelySearching && hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoadingMore}>
            {isLoadingMore ? "Caricamento..." : "Carica altri"}
          </Button>
        </div>
      )}
    </div>
  );
}
