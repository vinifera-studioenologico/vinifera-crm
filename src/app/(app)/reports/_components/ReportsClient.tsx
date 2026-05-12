"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, FileText, Download } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import type { ReportDoc } from "@/schemas/report";
import { formatDate } from "@/lib/utils/date";
import { DataTable } from "@/components/data-table/DataTable";
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
}

export function ReportsClient({ initialData }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const filtered = initialData.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.number.toLowerCase().includes(q) ||
      r.clientSnapshot.displayName.toLowerCase().includes(q)
    );
  });

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
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <a
            href={`/api/pdf/report/${row.original.id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="ghost" size="icon" aria-label="Scarica PDF">
              <Download className="size-3.5" strokeWidth={1.75} />
            </Button>
          </a>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
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
        <Button onClick={() => router.push("/reports/new")}>
          <Plus className="size-3.5" strokeWidth={1.75} />
          Nuovo referto
        </Button>
      </div>

      {/* Ricerca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Cerca per numero o cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Tabella / empty */}
      {filtered.length === 0 && !search ? (
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
          globalFilter={search}
          emptyMessage="Nessun referto trovato."
        />
      )}
    </div>
  );
}
