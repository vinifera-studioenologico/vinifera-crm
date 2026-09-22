"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowRight } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { MonthlyRevenue, SamplesByMonth } from "@/server/actions/stats";
import type { ExpensesByMonthPoint, IncomeByMethodRow } from "@/lib/calc/expenses-breakdown";
import type { ExpenseCategory } from "@/schemas/cost";
import { formatEUR } from "@/lib/utils/money";
import { CATEGORY_LABELS, CATEGORY_COLORS, PAYMENT_METHOD_LABELS, PAYMENT_METHOD_COLORS } from "@/lib/constants/expenses";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "supplier_invoice",
  "utility",
  "maintenance",
  "consumable",
  "kit_purchase",
  "fixed_cost",
  "other",
];

/** Tema risolto in modo sicuro per l'hydration: "light" finché non è montato. */
function useResolvedChartTheme(): "light" | "dark" {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);
  return mounted && resolvedTheme === "dark" ? "dark" : "light";
}

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
          {p.name}: {formatEUR(Math.round(p.value * 100))}
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

function EurPieTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { fill: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!;
  return (
    <div className="rounded-lg border border-border bg-card shadow-md px-3 py-2 text-xs">
      <p className="font-semibold" style={{ color: p.payload.fill }}>
        {p.name}: {formatEUR(Math.round(p.value * 100))}
      </p>
    </div>
  );
}

// ── Componente principale ─────────────────────────────────────────────
interface Props {
  initialRevenue: MonthlyRevenue[];
  samplesByMonth: SamplesByMonth[];
  expensesByCategory: ExpensesByMonthPoint[];
  incomeByMethod: IncomeByMethodRow[];
  currentYear: number;
}

export function StatsClient({
  initialRevenue,
  samplesByMonth,
  expensesByCategory,
  incomeByMethod,
  currentYear,
}: Props) {
  const [selectedYear] = useState(currentYear);
  const router = useRouter();
  const chartTheme = useResolvedChartTheme();

  const expensesChartData = expensesByCategory.map((point) => {
    const row: Record<string, string | number> = { month: point.month };
    for (const cat of EXPENSE_CATEGORIES) row[cat] = point[cat] / 100;
    return row;
  });
  const hasExpenses = expensesByCategory.some((p) =>
    EXPENSE_CATEGORIES.some((cat) => p[cat] > 0),
  );

  const totalIncome = incomeByMethod.reduce((s, r) => s + r.totalCents, 0);
  const incomeChartData = incomeByMethod.map((r) => ({
    name: PAYMENT_METHOD_LABELS[r.method] ?? r.method,
    value: r.totalCents / 100,
    percent: totalIncome > 0 ? Math.round((r.totalCents / totalIncome) * 100) : 0,
    fill: PAYMENT_METHOD_COLORS[r.method]?.[chartTheme] ?? "#6b7280",
  }));

  // Converte i centesimi in euro per il grafico
  const revenueChartData = initialRevenue.map((r) => ({
    month: r.month,
    Incassato: r.incassatoCents / 100,
    "Da incassare": r.attesoCents / 100,
  }));

  // Totali anno
  const totalIncassato = initialRevenue.reduce((s, r) => s + r.incassatoCents, 0);
  const totalStimato = initialRevenue.reduce((s, r) => s + r.attesoCents, 0);
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
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mt-1">
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
            <p className="text-xs text-muted-foreground">Da incassare {selectedYear}</p>
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
            Confronto tra importo incassato e rate ancora da incassare (scadenza nel mese)
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
                fill="#10b981"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="Da incassare"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
                minPointSize={3}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Grafico spese per categoria — card cliccabile verso /stats/spese */}
      <Card
        className="cursor-pointer transition-colors hover:bg-accent/40"
        onClick={() => router.push("/stats/spese")}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") router.push("/stats/spese");
        }}
      >
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Spese per categoria {selectedYear}</CardTitle>
              <CardDescription>Andamento mensile delle spese per categoria</CardDescription>
            </div>
            <span className="flex items-center gap-1 text-xs font-medium text-primary shrink-0">
              Vedi dettaglio
              <ArrowRight className="size-3.5" />
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {hasExpenses ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart
                data={expensesChartData}
                margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
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
                {EXPENSE_CATEGORIES.map((cat) => (
                  <Line
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    name={CATEGORY_LABELS[cat]}
                    stroke={CATEGORY_COLORS[cat][chartTheme]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nessuna spesa registrata per il {selectedYear}.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Grafico incassi per metodo di pagamento */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Incassi per metodo {selectedYear}</CardTitle>
          <CardDescription>Distribuzione dell&apos;incassato per metodo di pagamento</CardDescription>
        </CardHeader>
        <CardContent>
          {incomeChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={incomeChartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                >
                  {incomeChartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<EurPieTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value: string) => {
                    const p = incomeChartData.find((d) => d.name === value);
                    return `${value} — ${p ? formatEUR(Math.round(p.value * 100)) : ""} (${p?.percent ?? 0}%)`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nessun incasso registrato per il {selectedYear}.
            </p>
          )}
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
