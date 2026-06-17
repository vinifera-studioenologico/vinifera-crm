"use client";

import Link from "next/link";
import {
  TrendingDown,
  TrendingUp,
  Receipt,
  CalendarClock,
  Calculator,
  BarChart2,
  AlertTriangle,
  Package,
} from "lucide-react";

import type { CostsSummary } from "@/server/actions/costs";
import type { ExpenseDoc } from "@/schemas/cost";
import { formatEUR } from "@/lib/utils/money";
import { cn } from "@/lib/utils";

import { KpiCard } from "@/components/widgets/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

interface Props {
  summary: CostsSummary;
  recentExpenses: ExpenseDoc[];
  belowCostCount: number;
  monthLabel: string;
}

export function CostsDashboardClient({ summary, recentExpenses, belowCostCount, monthLabel }: Props) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Costi &amp; Marginalità</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-2xl font-semibold">Costi &amp; Marginalità</h1>
          <p className="text-sm text-muted-foreground">{monthLabel}</p>
        </div>
      </div>

      {/* KPI cards — row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Spese variabili"
          icon={Receipt}
          value={formatEUR(summary.totalExpensesCents)}
          description={
            summary.kitPurchasesCents > 0
              ? `di cui kit: ${formatEUR(summary.kitPurchasesCents)}`
              : "Spese del mese corrente"
          }
        />
        <KpiCard
          title="Costi fissi (prorata)"
          icon={CalendarClock}
          value={formatEUR(summary.totalFixedMonthlyCents)}
          description="Quota mensile costi fissi"
        />
        <KpiCard
          title="Totale mese"
          icon={Calculator}
          value={formatEUR(summary.totalMonthlyCents)}
          description="Variabili + fissi"
        />
        <KpiCard
          title="Costo per analisi"
          icon={BarChart2}
          value={formatEUR(summary.estimatedCostPerAnalysisCents)}
          description={`Su ${summary.estimatedCostPerAnalysisCents > 0 ? "stime configurate" : "—"}`}
        />
      </div>

      {/* KPI cards — row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Margine medio"
          icon={summary.marginPercent >= 0 ? TrendingUp : TrendingDown}
          value={`${summary.marginPercent}%`}
          description="Su prezzo listino medio analisi"
          className={summary.marginPercent < 0 ? "border-destructive/40" : undefined}
        />
        <KpiCard
          title="Analisi sotto costo"
          icon={AlertTriangle}
          value={String(belowCostCount)}
          description={belowCostCount > 0 ? "Revisione consigliata" : "Tutto ok"}
          className={belowCostCount > 0 ? "border-destructive/40" : undefined}
        />
        <KpiCard
          title="Kit mappati"
          icon={Package}
          value={String(summary.kitsCount)}
          description={`Costo medio/test ${formatEUR(summary.avgCostPerTestCents)}`}
        />
        <Card>
          <CardHeader className="pb-2 pt-5 px-5">
            <CardTitle className="text-sm font-medium text-muted-foreground">Link rapidi</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 flex flex-col gap-1.5 text-sm">
            <Link href="/costs/expenses/new" className="text-primary hover:underline">+ Nuova spesa</Link>
            <Link href="/costs/fixed" className="text-primary hover:underline">Costi fissi</Link>
            <Link href="/costs/pricing" className="text-primary hover:underline">Pricing suggerito</Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent expenses mini-table */}
      <Card>
        <CardHeader className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Ultime spese registrate</CardTitle>
            <Link href="/costs/expenses" className="text-xs text-primary hover:underline">
              Vedi tutte →
            </Link>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {recentExpenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna spesa registrata.</p>
          ) : (
            <div className="divide-y divide-border">
              {recentExpenses.map((e) => (
                <Link
                  key={e.id}
                  href={`/costs/expenses/${e.id}`}
                  className="flex items-center justify-between py-2.5 hover:text-primary transition-colors group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-primary">
                      {e.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {e.date} {e.supplier ? `· ${e.supplier}` : ""}
                    </p>
                  </div>
                  <span className="ml-4 text-sm font-semibold tabular-nums shrink-0">
                    {formatEUR(e.totalCents)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
