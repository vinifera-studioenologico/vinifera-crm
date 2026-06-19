"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Info, Settings } from "lucide-react";

import type { SuggestedPricing } from "@/server/actions/costs";
import { formatEUR } from "@/lib/utils/money";
import { cn } from "@/lib/utils";

import { DataTable } from "@/components/data-table/DataTable";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

type PricingStatus = "ok" | "below_cost" | "low_margin" | "unknown_kit";

function getPricingStatus(row: SuggestedPricing, targetMargin: number): PricingStatus {
  if (row.kitCostPerTestCents === null) return "unknown_kit";
  if (row.belowCost) return "below_cost";
  if (row.marginPercent < targetMargin) return "low_margin";
  return "ok";
}

function StatusBadge({ status }: { status: PricingStatus }) {
  if (status === "ok") {
    return <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-0">OK</Badge>;
  }
  if (status === "below_cost") {
    return <Badge variant="destructive">Sotto costo</Badge>;
  }
  if (status === "low_margin") {
    return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0">Margine basso</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground">Kit sconosciuto</Badge>;
}

function BreakdownRow({
  label,
  value,
  strong,
  muted,
  op,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  op?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span
        className={cn(
          "flex items-baseline gap-1.5",
          muted ? "text-muted-foreground" : "text-foreground",
          strong && "font-medium",
        )}
      >
        {op && <span className="w-3 text-center font-mono text-muted-foreground">{op}</span>}
        {label}
      </span>
      <span className={cn("tabular-nums", strong && "font-semibold")}>{value}</span>
    </div>
  );
}

function SuggestedPriceCell({ row }: { row: SuggestedPricing }) {
  const kitCost = row.kitCostPerTestCents ?? 0;
  const allocableMonthly = Math.round(
    (row.totalFixedMonthlyCents + row.avgMonthlyOverheadCents) * (row.allocationPercent / 100),
  );
  return (
    <div className="flex items-center gap-1.5">
      <span className="tabular-nums">{formatEUR(row.suggestedPriceCents)}</span>
      <Popover>
        <PopoverTrigger
          aria-label="Dettaglio calcolo prezzo suggerito"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <Info className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <PopoverHeader>
            <PopoverTitle>Come calcoliamo il prezzo suggerito</PopoverTitle>
          </PopoverHeader>

          <div className="flex flex-col gap-1 text-xs">
            <BreakdownRow
              label="Costo kit / test"
              value={
                row.kitCostPerTestCents !== null ? formatEUR(row.kitCostPerTestCents) : "Non mappato"
              }
              muted
            />
            <BreakdownRow
              op="+"
              label="Quota costi indiretti"
              value={formatEUR(row.fixedCostQuotaCents)}
              muted
            />
            <div className="my-1 border-t border-border" />
            <BreakdownRow label="Costo totale / test" value={formatEUR(row.totalCostCents)} strong />
            <BreakdownRow
              op="×"
              label={`Ricarico target +${row.marginPercentTarget}%`}
              value={`(1 + ${row.marginPercentTarget}/100)`}
              muted
            />
            <div className="my-1 border-t border-border" />
            <BreakdownRow
              label="Prezzo suggerito"
              value={formatEUR(row.suggestedPriceCents)}
              strong
            />
          </div>

          <div className="mt-1 rounded-md bg-muted/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Dettaglio derivazione</p>
            <p>
              Costi indiretti mensili = costi fissi {formatEUR(row.totalFixedMonthlyCents)} + spese
              generali medie/mese (ultimi 12 mesi, esclusi kit){" "}
              {formatEUR(row.avgMonthlyOverheadCents)} ={" "}
              {formatEUR(row.totalFixedMonthlyCents + row.avgMonthlyOverheadCents)}
            </p>
            <p className="mt-1">
              Quota imputata alle analisi = {row.allocationPercent}% ={" "}
              {formatEUR(allocableMonthly)} ÷ {row.estimatedMonthlyAnalyses} analisi/mese ={" "}
              {formatEUR(row.fixedCostQuotaCents)}
            </p>
            <p className="mt-1">
              Costo totale = {formatEUR(kitCost)} (kit) + {formatEUR(row.fixedCostQuotaCents)}{" "}
              (indiretti) = {formatEUR(row.totalCostCents)}
            </p>
            <p className="mt-1">
              Prezzo suggerito = {formatEUR(row.totalCostCents)} × (1 + {row.marginPercentTarget}
              /100) = {formatEUR(row.suggestedPriceCents)}
            </p>
            <p className="mt-1">
              Margine attuale sul listino = (listino {formatEUR(row.currentPriceCents)} − costo{" "}
              {formatEUR(row.totalCostCents)}) ÷ listino = <strong>{row.marginPercent}%</strong>
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface Props {
  data: SuggestedPricing[];
  targetMarginPercent: number;
}

export function PricingTable({ data, targetMarginPercent }: Props) {
  const belowCostCount = data.filter((r) => r.belowCost).length;

  const columns: ColumnDef<SuggestedPricing>[] = [
    {
      id: "analysis",
      header: "Analisi",
      cell: ({ row }) => (
        <div>
          <span className="font-mono text-xs text-muted-foreground mr-2">
            {row.original.analysisCode}
          </span>
          <span className="font-medium">{row.original.analysisName}</span>
        </div>
      ),
    },
    {
      id: "currentPrice",
      header: "Prezzo listino",
      cell: ({ row }) => (
        <span className="tabular-nums">{formatEUR(row.original.currentPriceCents)}</span>
      ),
    },
    {
      id: "kitCost",
      header: "Costo kit/test",
      cell: ({ row }) =>
        row.original.kitCostPerTestCents !== null
          ? formatEUR(row.original.kitCostPerTestCents)
          : <span className="text-muted-foreground text-xs">Non mappato</span>,
    },
    {
      id: "fixedQuota",
      header: "Quota indiretti",
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {formatEUR(row.original.fixedCostQuotaCents)}
        </span>
      ),
    },
    {
      id: "totalCost",
      header: "Costo totale",
      cell: ({ row }) => (
        <span className="tabular-nums font-medium">{formatEUR(row.original.totalCostCents)}</span>
      ),
    },
    {
      id: "suggestedPrice",
      header: "Prezzo suggerito",
      cell: ({ row }) => <SuggestedPriceCell row={row.original} />,
    },
    {
      id: "margin",
      header: "Margine %",
      cell: ({ row }) => {
        const m = row.original.marginPercent;
        return (
          <span
            className={cn(
              "tabular-nums font-semibold",
              m < 0
                ? "text-destructive"
                : m < targetMarginPercent
                ? "text-amber-600 dark:text-amber-400"
                : "text-green-600 dark:text-green-400",
            )}
          >
            {m}%
          </span>
        );
      },
    },
    {
      id: "status",
      header: "Stato",
      cell: ({ row }) => (
        <StatusBadge status={getPricingStatus(row.original, targetMarginPercent)} />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>Costi</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Pricing suggerito</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-start justify-between gap-4 mt-2">
          <div>
            <h1 className="text-2xl font-semibold">Pricing suggerito</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Margine target:{" "}
              <span className="font-semibold text-foreground">{targetMarginPercent}%</span>
              {belowCostCount > 0 && (
                <span className="ml-3 text-destructive font-medium">
                  ⚠ {belowCostCount} {belowCostCount === 1 ? "analisi sotto costo" : "analisi sotto costo"}
                </span>
              )}
            </p>
          </div>
          <Link
            href="/costs/settings"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings className="size-3.5" />
            Modifica margine
          </Link>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data}
        emptyMessage="Nessuna analisi attiva trovata."
      />
    </div>
  );
}
