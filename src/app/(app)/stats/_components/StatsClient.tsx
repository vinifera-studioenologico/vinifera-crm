"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { MonthlyRevenue, SamplesByMonth } from "@/server/actions/stats";
import { formatEUR } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

// ── Tooltip personalizzato ────────────────────────────────────────────
function EurTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card shadow-md px-3 py-2 text-xs space-y-1">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {formatEUR(p.value)}
        </p>
      ))}
    </div>
  );
}

function CountTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card shadow-md px-3 py-2 text-xs space-y-1">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

// ── Componente principale ─────────────────────────────────────────────
interface Props {
  initialRevenue: MonthlyRevenue[];
  samplesByMonth: SamplesByMonth[];
  currentYear: number;
}

export function StatsClient({ initialRevenue, samplesByMonth, currentYear }: Props) {
  const [selectedYear] = useState(currentYear);

  // Converte i centesimi in euro per il grafico
  const revenueChartData = initialRevenue.map((r) => ({
    month: r.month,
    Incassato: r.incassatoCents / 100,
    Stimato: r.attesoContents / 100,
  }));

  // Totali anno
  const totalIncassato = initialRevenue.reduce((s, r) => s + r.incassatoCents, 0);
  const totalStimato = initialRevenue.reduce((s, r) => s + r.attesoContents, 0);
  const bestMonth = [...initialRevenue].sort(
    (a, b) => b.incassatoCents - a.incassatoCents,
  )[0];

  const totalSamples = samplesByMonth.reduce(
    (s, m) => s + m.pending + m.in_progress + m.completed + m.cancelled,
    0,
  );
  const completionRate = (() => {
    const completed = samplesByMonth.reduce((s, m) => s + m.completed, 0);
    return totalSamples > 0 ? Math.round((completed / totalSamples) * 100) : 0;
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Statistiche</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center justify-between mt-1">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Statistiche
            </h1>
            <p className="text-sm text-muted-foreground">
              Andamento {selectedYear}
            </p>
          </div>
          <div className="flex gap-1.5">
            {[currentYear - 1, currentYear].map((y) => (
              <Button
                key={y}
                size="sm"
                variant={selectedYear === y ? "default" : "outline"}
                className="text-xs"
                disabled
              >
                {y}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI di sintesi anno */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Incassato {selectedYear}</p>
            <p className="text-2xl font-semibold tabular-nums mt-1">
              {formatEUR(totalIncassato)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Stimato campioni</p>
            <p className="text-2xl font-semibold tabular-nums mt-1">
              {formatEUR(totalStimato)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Mese migliore</p>
            <p className="text-2xl font-semibold tabular-nums mt-1">
              {bestMonth && bestMonth.incassatoCents > 0
                ? `${bestMonth.month} (${formatEUR(bestMonth.incassatoCents)})`
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Tasso completamento</p>
            <p className="text-2xl font-semibold tabular-nums mt-1">
              {completionRate}%
            </p>
            <p className="text-xs text-muted-foreground">{totalSamples} campioni totali</p>
          </CardContent>
        </Card>
      </div>

      {/* Grafico entrate mensili */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entrate mensili {selectedYear}</CardTitle>
          <CardDescription>
            Confronto tra importo incassato e stimato (campioni ricevuti)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={revenueChartData}
              margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
              barCategoryGap="30%"
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => `€${v < 1000 ? v : `${(v / 1000).toFixed(0)}k`}`}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip content={<EurTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="Incassato"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="Stimato"
                fill="hsl(var(--muted-foreground))"
                radius={[4, 4, 0, 0]}
                opacity={0.4}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Grafico campioni per stato */}
      {samplesByMonth.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campioni per stato (ultimi 6 mesi)</CardTitle>
            <CardDescription>
              Distribuzione dei campioni ricevuti per mese e stato
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart
                data={samplesByMonth}
                margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip content={<CountTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="completed"
                  name="Completati"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="in_progress"
                  name="In lavorazione"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="pending"
                  name="In attesa"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="cancelled"
                  name="Annullati"
                  stroke="#6b7280"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {samplesByMonth.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Nessun campione negli ultimi 6 mesi per costruire il grafico.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
