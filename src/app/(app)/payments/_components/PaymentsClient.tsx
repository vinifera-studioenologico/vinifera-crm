"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Search, CreditCard, ChevronRight } from "lucide-react";

import type { PaymentDoc, PaymentStatus } from "@/schemas/payment";
import { formatEUR } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";
import { DataTable } from "@/components/data-table/DataTable";
import { CsvExportButton } from "@/components/data-table/CsvExportButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

const STATUS_CONFIG: Record<PaymentStatus, { label: string; className: string }> = {
  pending: {
    label: "In attesa",
    className:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
  },
  partial: {
    label: "Parziale",
    className:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400",
  },
  paid: {
    label: "Pagato",
    className:
      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  overdue: {
    label: "Scaduto",
    className:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400",
  },
  cancelled: {
    label: "Annullato",
    className: "bg-muted text-muted-foreground border-border",
  },
};

interface Props {
  initialData: PaymentDoc[];
}

export function PaymentsClient({ initialData }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "all">("all");
  const [showCancelled, setShowCancelled] = useState(false);

  const filtered = initialData.filter((p) => {
    if (!showCancelled && p.status === "cancelled") return false;
    if (showCancelled && p.status !== "cancelled") return false;
    if (!showCancelled && statusFilter !== "all" && p.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return p.description.toLowerCase().includes(q);
  });

  // KPI globali
  const totalPending = initialData
    .filter((p) => p.status === "pending" || p.status === "partial")
    .reduce((s, p) => s + (p.totalAmountCents - p.paidAmountCents), 0);

  const totalOverdue = initialData
    .filter((p) => p.status === "overdue")
    .reduce((s, p) => s + (p.totalAmountCents - p.paidAmountCents), 0);

  const totalRevenue = initialData.reduce((s, p) => s + p.paidAmountCents, 0);

  const sourceLabel: Record<string, string> = {
    sample: "Campione",
    package: "Pacchetto",
    manual: "Manuale",
  };

  const columns: ColumnDef<PaymentDoc>[] = [
    {
      id: "description",
      header: "Descrizione",
      cell: ({ row }) => {
        const src = row.original.source;
        const subline = src.sampleCode
          ? `Campione · ${src.sampleCode}`
          : (sourceLabel[src.kind] ?? src.kind);
        return (
          <div>
            <p className="text-sm font-medium">{row.original.description}</p>
            <p className="text-xs text-muted-foreground">
              {subline}
              {row.original.installmentsCount > 1
                ? ` · ${row.original.installmentsCount} rate`
                : ""}
            </p>
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Stato",
      size: 130,
      cell: ({ row }) => {
        const cfg = STATUS_CONFIG[row.original.status];
        return (
          <Badge variant="outline" className={cfg.className}>
            {cfg.label}
          </Badge>
        );
      },
    },
    {
      id: "totals",
      header: "Importo",
      size: 150,
      cell: ({ row }) => (
        <div className="text-sm tabular-nums">
          <p className="font-medium">{formatEUR(row.original.totalAmountCents)}</p>
          {row.original.paidAmountCents > 0 && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Incassato {formatEUR(row.original.paidAmountCents)}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "createdAt",
      header: "Creato il",
      size: 110,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.createdAt
            ? formatDate(row.original.createdAt as Parameters<typeof formatDate>[0])
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
            onClick={() =>
              router.push(`/clients/${row.original.clientId}/payments`)
            }
            aria-label="Vai a pagamenti cliente"
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
      <div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Pagamenti</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Pagamenti
        </h1>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Da incassare</p>
          <p className="text-xl font-semibold tabular-nums mt-1 text-amber-600 dark:text-amber-400">
            {formatEUR(totalPending)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Scaduto</p>
          <p className="text-xl font-semibold tabular-nums mt-1 text-red-600 dark:text-red-400">
            {formatEUR(totalOverdue)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Incassato tot.</p>
          <p className="text-xl font-semibold tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">
            {formatEUR(totalRevenue)}
          </p>
        </div>
      </div>

      {/* Filtri */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-3 md:flex-wrap">
        <div className="relative w-full md:flex-1 md:min-w-48 md:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Cerca per descrizione..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        {!showCancelled && (
          <div className="flex gap-1.5 flex-wrap">
            {(["all", "pending", "partial", "overdue", "paid"] as const).map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(s)}
                className="text-xs"
              >
                {s === "all" ? "Tutti" : STATUS_CONFIG[s as PaymentStatus]?.label ?? s}
              </Button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 md:ml-auto">
          <CsvExportButton
            data={filtered}
            columns={[
              { header: "Descrizione", accessor: (p: PaymentDoc) => p.description },
              { header: "Stato", accessor: (p: PaymentDoc) => STATUS_CONFIG[p.status].label },
              { header: "Importo totale (\u20ac)", accessor: (p: PaymentDoc) => (p.totalAmountCents / 100).toFixed(2).replace(".", ",") },
              { header: "Incassato (\u20ac)", accessor: (p: PaymentDoc) => (p.paidAmountCents / 100).toFixed(2).replace(".", ",") },
              { header: "Residuo (\u20ac)", accessor: (p: PaymentDoc) => ((p.totalAmountCents - p.paidAmountCents) / 100).toFixed(2).replace(".", ",") },
              { header: "N. rate", accessor: (p: PaymentDoc) => String(p.installmentsCount) },
              { header: "Creato il", accessor: (p: PaymentDoc) => p.createdAt ? formatDate(p.createdAt as Parameters<typeof formatDate>[0]) : "" },
            ]}
            filenamePrefix="pagamenti"
          />
          <Label htmlFor="show-cancelled" className="text-sm text-muted-foreground cursor-pointer">
            Mostra annullati
          </Label>
          <Switch
            id="show-cancelled"
            checked={showCancelled}
            onCheckedChange={(v) => {
              setShowCancelled(v);
              setStatusFilter("all");
            }}
          />
        </div>
      </div>

      {/* Tabella / empty state */}
      {filtered.length === 0 && !search && statusFilter === "all" ? (
        <div className="rounded-xl border border-border bg-card p-16 flex flex-col items-center gap-3 text-center">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center">
            <CreditCard className="size-5 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-foreground">
            {showCancelled ? "Nessun pagamento annullato" : "Nessun pagamento"}
          </p>
          {!showCancelled && (
            <p className="text-xs text-muted-foreground max-w-xs">
              I pagamenti appariranno qui quando vengono creati da campioni, pacchetti o manualmente.
            </p>
          )}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          globalFilter={search}
          emptyMessage={
            showCancelled
              ? "Nessun pagamento annullato corrisponde alla ricerca."
              : "Nessun pagamento trovato per i filtri selezionati."
          }
          rowClassName={(row) => (row.status === "cancelled" ? "opacity-50" : "")}
        />
      )}
    </div>
  );
}
