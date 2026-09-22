"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Target, TrendingUp, TrendingDown, Plus } from "lucide-react";

import type { GoalDoc } from "@/schemas/goal";
import type { GoalProgress } from "@/server/actions/goals";
import type { GoalMetricProgress } from "@/lib/calc/goals";
import { formatEUR } from "@/lib/utils/money";
import { GoalForm } from "@/components/forms/GoalForm";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

function GoalMetricCard({
  label,
  progress,
  formatValue,
}: {
  label: string;
  progress: GoalMetricProgress;
  formatValue: (n: number) => string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
          {label}
          {progress.onTrack ? (
            <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
          ) : (
            <TrendingDown className="size-4 text-amber-600 dark:text-amber-400" strokeWidth={1.75} />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{formatValue(progress.current)}</p>
        <p className="text-sm text-muted-foreground">
          di {formatValue(progress.target)} ({progress.actualPercent}%)
        </p>
        <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              progress.onTrack ? "bg-primary" : "bg-amber-500",
            )}
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {progress.remaining > 0
            ? `Mancano ${formatValue(progress.remaining)}`
            : "Obiettivo raggiunto"}
          {" · "}
          {progress.onTrack ? "in linea" : "in ritardo"}
        </p>
      </CardContent>
    </Card>
  );
}

function YearGoalsSection({
  year,
  progress,
  editable,
  onEdit,
}: {
  year: number;
  progress: GoalProgress;
  editable: boolean;
  onEdit?: () => void;
}) {
  const metrics: Array<{ key: string; label: string; progress: GoalMetricProgress | null; formatValue: (n: number) => string }> = [
    { key: "revenue", label: "Fatturato incassato", progress: progress.revenue, formatValue: formatEUR },
    { key: "business", label: "Nuove aziende", progress: progress.newBusinessClients, formatValue: (n) => String(n) },
    { key: "private", label: "Nuovi privati", progress: progress.newPrivateClients, formatValue: (n) => String(n) },
  ];
  const activeMetrics = metrics.filter((m) => m.progress != null);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{year}</h2>
        {editable && (
          <Button size="sm" variant="outline" onClick={onEdit}>
            Modifica obiettivi
          </Button>
        )}
      </div>
      {activeMetrics.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun obiettivo impostato per il {year}.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {activeMetrics.map((m) => (
            <GoalMetricCard key={m.key} label={m.label} progress={m.progress!} formatValue={m.formatValue} />
          ))}
        </div>
      )}
    </section>
  );
}

interface Props {
  currentYear: number;
  currentGoal: GoalDoc | null;
  currentProgress: GoalProgress;
  historicalProgress: GoalProgress[];
}

export function ObiettiviClient({ currentYear, currentGoal, currentProgress, historicalProgress }: Props) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Obiettivi</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Obiettivi</h1>
        <p className="text-sm text-muted-foreground">Obiettivi annuali e avanzamento sui dati reali</p>
      </div>

      {!currentProgress.hasGoals ? (
        <Card className="border-primary/30">
          <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Target className="size-5 text-primary" strokeWidth={1.75} />
            </div>
            <p className="text-sm font-medium text-foreground">
              Obiettivi {currentYear} non ancora impostati
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Imposta almeno un obiettivo per vedere l&apos;avanzamento calcolato sui dati reali.
            </p>
            <Button size="sm" onClick={() => setSheetOpen(true)}>
              <Plus className="mr-2 size-4" />
              Imposta obiettivi {currentYear}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <YearGoalsSection
          year={currentYear}
          progress={currentProgress}
          editable
          onEdit={() => setSheetOpen(true)}
        />
      )}

      {historicalProgress.length > 0 && (
        <div className="space-y-6 pt-2 border-t border-border">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground pt-6">
            Storico
          </h2>
          {historicalProgress.map((p) => (
            <YearGoalsSection key={p.year} year={p.year} progress={p} editable={false} />
          ))}
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Obiettivi {currentYear}</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <GoalForm
              year={currentYear}
              existing={currentGoal}
              onSuccess={() => {
                setSheetOpen(false);
                router.refresh();
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
