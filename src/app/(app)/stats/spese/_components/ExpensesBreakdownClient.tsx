"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import { ArrowLeft } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

import type { ExpensesBreakdown } from "@/lib/calc/expenses-breakdown";
import { formatEUR } from "@/lib/utils/money";
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  UNSPECIFIED_SUBCATEGORY_LABEL,
} from "@/lib/constants/expenses";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

const MUTED_COLOR = "#898781";

/** Tema risolto in modo sicuro per l'hydration: "light" finché non è montato. */
function useResolvedChartTheme(): "light" | "dark" {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);
  return mounted && resolvedTheme === "dark" ? "dark" : "light";
}

/**
 * Sfumatura del colore di categoria per le sottocategorie: rampa mono-hue
 * (stessa idea della sequential ramp), non un secondo set di hue categoriche
 * — comunica "parte di questa categoria" invece di introdurre nuova identità
 * da distinguere. Il bucket "" (non specificata) resta sempre grigio muto,
 * lo stesso trattamento riservato altrove ai dati mancanti.
 */
function subShade(categoryHex: string, key: string, index: number, total: number): string {
  if (key === "") return MUTED_COLOR;
  if (total <= 1) return categoryHex;
  const alpha = 1 - (index / Math.max(1, total - 1)) * 0.55;
  const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return `${categoryHex}${alphaHex}`;
}

function PieTooltip({ active, payload }: {
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

interface Props {
  breakdown: ExpensesBreakdown;
  selectedYear: number;
  currentYear: number;
}

export function ExpensesBreakdownClient({ breakdown, selectedYear, currentYear }: Props) {
  const router = useRouter();
  const chartTheme = useResolvedChartTheme();

  const years = [currentYear - 2, currentYear - 1, currentYear];

  const categoryChartData = breakdown.categories.map((c) => ({
    name: CATEGORY_LABELS[c.category],
    value: c.totalCents / 100,
    percent: breakdown.totalCents > 0 ? Math.round((c.totalCents / breakdown.totalCents) * 100) : 0,
    fill: CATEGORY_COLORS[c.category][chartTheme],
  }));

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <Link href="/stats" className="hover:underline underline-offset-2">
                Statistiche
              </Link>
            </BreadcrumbItem>
            <BreadcrumbItem>
              <BreadcrumbPage>Spese per categoria</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mt-1">
          <div>
            <Link
              href="/stats"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              Torna alle statistiche
            </Link>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              Spese per categoria
            </h1>
            <p className="text-sm text-muted-foreground">Dettaglio {selectedYear}</p>
          </div>
          <div className="flex gap-1.5">
            {years.map((y) => (
              <Button
                key={y}
                size="sm"
                variant={selectedYear === y ? "default" : "outline"}
                className="text-xs"
                onClick={() => router.push(`/stats/spese?year=${y}`)}
              >
                {y}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {breakdown.totalCents === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              Nessuna spesa registrata per il {selectedYear}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Torta principale per categoria */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Totale spese per categoria</CardTitle>
              <CardDescription>
                {formatEUR(breakdown.totalCents)} spesi nel {selectedYear}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={categoryChartData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={80}
                      outerRadius={130}
                      paddingAngle={2}
                    >
                      {categoryChartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      formatter={(value: string) => {
                        const p = categoryChartData.find((d) => d.name === value);
                        return `${value} — ${p ? formatEUR(Math.round(p.value * 100)) : ""} (${p?.percent ?? 0}%)`;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center -translate-y-4">
                  <p className="text-xs text-muted-foreground">Totale</p>
                  <p className="text-xl font-semibold tabular-nums">{formatEUR(breakdown.totalCents)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Torte per sottocategoria, una per categoria valorizzata */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {breakdown.categories
              .filter((c) => c.subcategories.length > 0)
              .map((c) => {
                const categoryHex = CATEGORY_COLORS[c.category][chartTheme];
                const subChartData = c.subcategories.map((sc, index) => ({
                  name: sc.key || UNSPECIFIED_SUBCATEGORY_LABEL,
                  value: sc.totalCents / 100,
                  percent: c.totalCents > 0 ? Math.round((sc.totalCents / c.totalCents) * 100) : 0,
                  fill: subShade(categoryHex, sc.key, index, c.subcategories.length),
                }));
                return (
                  <Card key={c.category}>
                    <CardHeader>
                      <CardTitle className="text-base">{CATEGORY_LABELS[c.category]}</CardTitle>
                      <CardDescription>{formatEUR(c.totalCents)} nel {selectedYear}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie data={subChartData} dataKey="value" nameKey="name" outerRadius={85} paddingAngle={2}>
                            {subChartData.map((entry) => (
                              <Cell key={entry.name} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip content={<PieTooltip />} />
                          <Legend
                            wrapperStyle={{ fontSize: 11 }}
                            formatter={(value: string) => {
                              const p = subChartData.find((d) => d.name === value);
                              return `${value} (${p?.percent ?? 0}%)`;
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}
