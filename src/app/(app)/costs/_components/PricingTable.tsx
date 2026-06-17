"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Settings } from "lucide-react";

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
      header: "Quota fissi",
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
      cell: ({ row }) => (
        <span className="tabular-nums">{formatEUR(row.original.suggestedPriceCents)}</span>
      ),
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
