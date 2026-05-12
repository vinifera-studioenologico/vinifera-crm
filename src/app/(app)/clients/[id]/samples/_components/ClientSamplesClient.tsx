"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ChevronRight, FlaskConical } from "lucide-react";

import type { SampleDoc } from "@/schemas/sample";
import type { ClientDoc } from "@/schemas/client";
import type { AnalysisDoc } from "@/schemas/analysis";
import { getClientActivePkgs } from "@/server/actions/samples";
import { formatEUR } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";

import { SampleWizard } from "@/components/forms/SampleWizard";
import { SampleStatusBadge } from "@/components/widgets/SampleStatusBadge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface ActivePkg {
  id: string;
  packageNameSnapshot: string;
  remainingAnalyses: number;
}

interface Props {
  client: ClientDoc;
  initialSamples: SampleDoc[];
  analyses: AnalysisDoc[];
}

export function ClientSamplesClient({ client, initialSamples, analyses }: Props) {
  const router = useRouter();
  const [samples] = useState(initialSamples);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activePkgs, setActivePkgs] = useState<ActivePkg[]>([]);
  const [, startTransition] = useTransition();

  function handleOpenSheet() {
    // Carica pacchetti attivi del cliente
    startTransition(async () => {
      const pkgs = await getClientActivePkgs(client.id);
      setActivePkgs(pkgs);
      setSheetOpen(true);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Campioni ({samples.length})
        </h2>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            render={
              <Button size="sm" onClick={handleOpenSheet}>
                <Plus className="size-3.5" strokeWidth={1.75} />
                Nuovo campione
              </Button>
            }
          />
          <SheetContent side="right" className="overflow-y-auto">
            <SheetHeader className="mb-6">
              <SheetTitle>Nuovo campione — {client.displayName}</SheetTitle>
            </SheetHeader>
            <SampleWizard
              clients={[client]}
              analyses={analyses}
              activePackages={activePkgs}
              defaultClientId={client.id}
              onSuccess={(id) => {
                setSheetOpen(false);
                router.push(`/samples/${id}`);
              }}
            />
          </SheetContent>
        </Sheet>
      </div>

      {samples.length === 0 ? (
        <div className="rounded-xl border border-border border-dashed p-12 flex flex-col items-center gap-3 text-center">
          <FlaskConical className="size-6 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            Nessun campione registrato per questo cliente.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
          {samples.map((s) => (
            <button
              key={s.id}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
              onClick={() => router.push(`/samples/${s.id}`)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {s.code}
                  </span>
                  <SampleStatusBadge status={s.status} />
                </div>
                <p className="text-sm font-medium truncate mt-0.5">{s.sampleName}</p>
                <p className="text-xs text-muted-foreground">
                  {s.items.length} analisi ·{" "}
                  {s.receivedAt
                    ? formatDate(s.receivedAt as Parameters<typeof formatDate>[0])
                    : "—"}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium tabular-nums">
                  {formatEUR(s.estimatedTotalCents)}
                </p>
                <ChevronRight className="size-4 text-muted-foreground ml-auto mt-1" strokeWidth={1.75} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
