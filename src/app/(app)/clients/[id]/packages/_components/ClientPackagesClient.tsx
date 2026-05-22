"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Package, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { ClientPackageDoc, ClientPackageStatus, PackageDoc } from "@/schemas/package";
import type { ClientDoc } from "@/schemas/client";
import { cancelClientPackage } from "@/server/actions/clientPackages";
import { formatEUR } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";

import { ClientPackageForm } from "@/components/forms/ClientPackageForm";
import { Button } from "@/components/ui/button";
import { CsvExportButton } from "@/components/data-table/CsvExportButton";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<
  ClientPackageStatus,
  { label: string; className: string }
> = {
  active: {
    label: "Attivo",
    className:
      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  },
  exhausted: {
    label: "Esaurito",
    className: "bg-muted text-muted-foreground border-border",
  },
  cancelled: {
    label: "Annullato",
    className:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  },
};

function ClientPackageStatusBadge({ status }: { status: ClientPackageStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={cfg.className}>
      {cfg.label}
    </Badge>
  );
}

interface Props {
  client: ClientDoc;
  initialPackages: ClientPackageDoc[];
  packageTemplates: PackageDoc[];
}

export function ClientPackagesClient({
  client,
  initialPackages,
  packageTemplates,
}: Props) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ClientPackageDoc | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePurchaseSuccess() {
    setSheetOpen(false);
    router.refresh();
  }

  function handleCancel() {
    if (!cancelTarget) return;
    startTransition(async () => {
      const result = await cancelClientPackage(cancelTarget.id);
      if (result.success) {
        toast.success("Pacchetto annullato");
        setCancelTarget(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const active = initialPackages.filter((p) => p.status === "active");
  const exhausted = initialPackages.filter((p) => p.status === "exhausted");
  const cancelled = initialPackages.filter((p) => p.status === "cancelled");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Pacchetti cliente ({initialPackages.length})
        </h2>
        <div className="flex items-center gap-2">
          <CsvExportButton
            data={initialPackages}
            columns={[
              { header: "Pacchetto", accessor: (p: ClientPackageDoc) => p.packageNameSnapshot },
              { header: "Stato", accessor: (p: ClientPackageDoc) => STATUS_CONFIG[p.status].label },
              { header: "Analisi totali", accessor: (p: ClientPackageDoc) => String(p.totalAnalyses) },
              { header: "Analisi residue", accessor: (p: ClientPackageDoc) => String(p.remainingAnalyses) },
              { header: "Prezzo (\u20ac)", accessor: (p: ClientPackageDoc) => (p.priceCents / 100).toFixed(2).replace(".", ",") },
            ]}
            filenamePrefix="pacchetti_cliente"
          />
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger
              render={
                <Button size="sm">
                  <Plus className="size-3.5" strokeWidth={1.75} />
                  Acquista pacchetto
                </Button>
              }
            />
            <SheetContent side="right" className="overflow-y-auto">
              <SheetHeader className="mb-6">
                <SheetTitle>Acquista pacchetto — {client.displayName}</SheetTitle>
              </SheetHeader>
              <ClientPackageForm
                clientId={client.id}
                clientName={client.displayName}
                packages={packageTemplates}
                onSuccess={handlePurchaseSuccess}
              />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Empty state */}
      {initialPackages.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-12 flex flex-col items-center gap-3 text-center">
          <Package className="size-6 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            Nessun pacchetto acquistato per questo cliente.
          </p>
        </div>
      )}

      {/* Attivi */}
      {active.length > 0 && (
        <PackageGroup
          title="Attivi"
          items={active}
          onCancel={setCancelTarget}
        />
      )}

      {/* Esauriti */}
      {exhausted.length > 0 && (
        <PackageGroup title="Esauriti" items={exhausted} />
      )}

      {/* Annullati */}
      {cancelled.length > 0 && (
        <PackageGroup title="Annullati" items={cancelled} />
      )}

      {/* Dialog conferma annullamento */}
      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annulla pacchetto</DialogTitle>
            <DialogDescription>
              Il pacchetto{" "}
              <strong>{cancelTarget?.packageNameSnapshot}</strong> sarà annullato.
              Le analisi residue ({cancelTarget?.remainingAnalyses ?? 0}) non saranno
              rimborsate automaticamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Torna indietro
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={handleCancel}
            >
              {isPending && <Loader2 className="size-3.5 animate-spin" />}
              Annulla pacchetto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Gruppo pacchetti ──────────────────────────────────────────────────
function PackageGroup({
  title,
  items,
  onCancel,
}: {
  title: string;
  items: ClientPackageDoc[];
  onCancel?: (pkg: ClientPackageDoc) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </p>
      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
        {items.map((pkg) => {
          const usedPct =
            pkg.totalAnalyses > 0
              ? Math.round(
                  ((pkg.totalAnalyses - pkg.remainingAnalyses) / pkg.totalAnalyses) * 100,
                )
              : 0;

          return (
            <div key={pkg.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{pkg.packageNameSnapshot}</p>
                    <ClientPackageStatusBadge status={pkg.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Acquistato{" "}
                    {pkg.purchasedAt
                      ? formatDate(
                          pkg.purchasedAt as Parameters<typeof formatDate>[0],
                        )
                      : "—"}{" "}
                    · {formatEUR(pkg.priceCents)}
                  </p>
                </div>

                {onCancel && pkg.status === "active" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => onCancel(pkg)}
                  >
                    Annulla
                  </Button>
                )}
              </div>

              {/* Barra progresso analisi */}
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {pkg.totalAnalyses - pkg.remainingAnalyses} usate su{" "}
                    {pkg.totalAnalyses}
                  </span>
                  <span className="font-medium tabular-nums">
                    {pkg.remainingAnalyses} rimaste
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      pkg.status === "exhausted"
                        ? "bg-muted-foreground"
                        : pkg.status === "cancelled"
                          ? "bg-destructive/60"
                          : "bg-primary",
                    )}
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
