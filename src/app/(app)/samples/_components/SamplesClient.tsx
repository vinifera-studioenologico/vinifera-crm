"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Search, ChevronRight, FlaskConical } from "lucide-react";

import type { SampleDoc, SampleStatus } from "@/schemas/sample";
import type { ClientDoc } from "@/schemas/client";
import type { AnalysisDoc } from "@/schemas/analysis";
import { formatEUR } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";

import { DataTable } from "@/components/data-table/DataTable";
import { CsvExportButton } from "@/components/data-table/CsvExportButton";
import { SampleWizard } from "@/components/forms/SampleWizard";
import { SampleStatusBadge } from "@/components/widgets/SampleStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

const STATUS_LABELS: Record<SampleStatus, string> = {
  pending: "In attesa",
  in_progress: "In lavorazione",
  completed: "Completati",
  cancelled: "Annullati",
};

interface Props {
  initialData: SampleDoc[];
  clients: ClientDoc[];
  analyses: AnalysisDoc[];
}

export function SamplesClient({ initialData, clients, analyses }: Props) {
  const router = useRouter();
  const [data] = useState(initialData);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SampleStatus | "all">("all");
  const [sheetOpen, setSheetOpen] = useState(false);

  const filtered = data.filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.code.toLowerCase().includes(q) ||
      s.sampleName.toLowerCase().includes(q) ||
      s.clientNameSnapshot.toLowerCase().includes(q)
    );
  });

  const columns: ColumnDef<SampleDoc>[] = [
    {
      accessorKey: "code",
      header: "Codice",
      size: 130,
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.original.code}</span>
      ),
    },
    {
      id: "sample",
      header: "Campione",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.sampleName}</p>
          <p className="text-xs text-muted-foreground">{row.original.clientNameSnapshot}</p>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Stato",
      size: 140,
      cell: ({ row }) => <SampleStatusBadge status={row.original.status} />,
    },
    {
      id: "analyses",
      header: "Analisi",
      size: 80,
      cell: ({ row }) => (
        <span className="tabular-nums text-sm">{row.original.items.length}</span>
      ),
    },
    {
      accessorKey: "estimatedTotalCents",
      header: "Totale stimato",
      size: 130,
      cell: ({ row }) => (
        <span className="tabular-nums text-sm font-medium">
          {formatEUR(row.original.estimatedTotalCents)}
        </span>
      ),
    },
    {
      id: "receivedAt",
      header: "Ricevuto il",
      size: 110,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.receivedAt
            ? formatDate(row.original.receivedAt as Parameters<typeof formatDate>[0])
            : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      size: 60,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/samples/${row.original.id}`)}
            aria-label="Apri campione"
          >
            <ChevronRight className="size-3.5" strokeWidth={1.75} />
          </Button>
        </div>
      ),
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
                <BreadcrumbPage>Campioni</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Campioni
          </h1>
          <p className="text-sm text-muted-foreground">
            {data.filter((s) => s.status === "pending").length} in attesa ·{" "}
            {data.filter((s) => s.status === "in_progress").length} in lavorazione
          </p>
        </div>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            render={
              <Button className="w-full md:w-auto">
                <Plus className="size-3.5" strokeWidth={1.75} />
                Nuovo campione
              </Button>
            }
          />
          <SheetContent
            side="right"
            className="w-full sm:max-w-xl overflow-y-auto"
          >
            <SheetHeader className="mb-6">
              <SheetTitle>Nuovo campione</SheetTitle>
            </SheetHeader>
            <SampleWizard
              clients={clients}
              analyses={analyses}
              activePackages={[]}
              onSuccess={(id) => {
                setSheetOpen(false);
                router.push(`/samples/${id}`);
              }}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Filtri */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-3 md:flex-wrap">
        <div className="relative w-full md:flex-1 md:min-w-48 md:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Cerca per codice, campione o cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "pending", "in_progress", "completed", "cancelled"] as const).map(
            (s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(s)}
                className="text-xs"
              >
                {s === "all" ? "Tutti" : STATUS_LABELS[s]}
              </Button>
            ),
          )}
        </div>
        <CsvExportButton
          data={filtered}
          columns={[
            { header: "Codice", accessor: (s: SampleDoc) => s.code },
            { header: "Campione", accessor: (s: SampleDoc) => s.sampleName },
            { header: "Cliente", accessor: (s: SampleDoc) => s.clientNameSnapshot },
            { header: "Stato", accessor: (s: SampleDoc) => STATUS_LABELS[s.status] },
            { header: "N. analisi", accessor: (s: SampleDoc) => String(s.items.length) },
            { header: "Totale stimato (\u20ac)", accessor: (s: SampleDoc) => (s.estimatedTotalCents / 100).toFixed(2).replace(".", ",") },
            { header: "Ricevuto il", accessor: (s: SampleDoc) => s.receivedAt ? formatDate(s.receivedAt as Parameters<typeof formatDate>[0]) : "" },
          ]}
          filenamePrefix="campioni"
        />
      </div>

      {/* Tabella / empty state */}
      {filtered.length === 0 && !search && statusFilter === "all" ? (
        <div className="rounded-xl border border-border bg-card p-16 flex flex-col items-center gap-3 text-center">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center">
            <FlaskConical className="size-5 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-foreground">Nessun campione</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Accetta il primo campione con il pulsante &quot;Nuovo campione&quot;.
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          emptyMessage="Nessun campione trovato per i filtri selezionati."
        />
      )}
    </div>
  );
}
