"use client";

import { useState } from "react";
import Link from "next/link";
import { FlaskConical } from "lucide-react";

import type { CategorySummary } from "@/lib/calc/samples-summary";
import { KpiCard } from "@/components/widgets/KpiCard";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  summary: CategorySummary[];
}

export function AnalysesSummaryCards({ summary }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (summary.length === 0) return null;

  const open = summary.find((c) => c.key === openKey) ?? null;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summary.map((category) => (
          <button
            key={category.key || "uncategorized"}
            type="button"
            className="text-left"
            onClick={() => setOpenKey(category.key)}
          >
            <KpiCard
              title={category.label}
              icon={FlaskConical}
              value={String(category.count)}
              description={`su ${category.groups.length} campion${category.groups.length === 1 ? "e" : "i"}`}
              className="transition-colors hover:bg-muted/40"
            />
          </button>
        ))}
      </div>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpenKey(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{open?.label}</DialogTitle>
            <DialogDescription>
              {open?.count} analisi in corso su {open?.groups.length} campion
              {open && open.groups.length === 1 ? "e" : "i"}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-96">
            <div className="space-y-4 pr-3">
              {open?.groups.map((group) => (
                <div key={group.sampleId} className="space-y-1.5">
                  <Link
                    href={`/samples/${group.sampleId}`}
                    className="block rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <p className="text-sm font-medium">
                      {group.sampleName}{" "}
                      <span className="font-mono text-xs text-muted-foreground">
                        {group.code}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">{group.clientName}</p>
                  </Link>
                  <div className="rounded-xl border border-border divide-y divide-border">
                    {group.rows.map((row, i) => (
                      <div
                        key={`${row.analysisId}-${i}`}
                        className="flex items-center gap-3 px-3 py-2"
                      >
                        <span className="flex-1 min-w-0">
                          <span className="text-sm">{row.name}</span>
                          <span className="font-mono text-xs text-muted-foreground ml-1.5">
                            {row.code}
                          </span>
                        </span>
                        {row.hasResult ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-emerald-700 border-emerald-300 dark:text-emerald-400 shrink-0"
                          >
                            Risultato inserito
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-muted-foreground shrink-0"
                          >
                            In attesa
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
