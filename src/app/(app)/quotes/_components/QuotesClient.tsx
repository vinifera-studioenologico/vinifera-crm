"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  Search,
  ChevronRight,
  FileText,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import type { QuoteDoc, QuoteStatus } from "@/schemas/quote";
import type { ClientDoc } from "@/schemas/client";
import type { AnalysisDoc } from "@/schemas/analysis";
import { deleteQuote } from "@/server/actions/quotes";
import { formatEUR } from "@/lib/utils/money";

import { DataTable } from "@/components/data-table/DataTable";
import { QuoteForm } from "@/components/forms/QuoteForm";
import { QuoteStatusBadge } from "@/components/widgets/QuoteStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

interface Props {
  initialData: QuoteDoc[];
  clients: ClientDoc[];
  analyses: AnalysisDoc[];
  defaultEnpaiaApplied?: boolean;
  defaultEnpaiaPercent?: number;
}

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Bozze",
  pending_approval: "In approvazione",
  approved: "Approvati",
  rejected: "Rifiutati",
  cancelled: "Annullati",
};

export function QuotesClient({ initialData, clients, analyses, defaultEnpaiaApplied, defaultEnpaiaPercent }: Props) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "all">("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState<QuoteDoc | null>(null);
  const [, startTransition] = useTransition();

  const filtered = data.filter((q) => {
    if (statusFilter !== "all" && q.status !== statusFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      q.number.toLowerCase().includes(s) ||
      q.clientSnapshot.displayName.toLowerCase().includes(s)
    );
  });

  function handleDelete(quote: QuoteDoc) {
    startTransition(async () => {
      const result = await deleteQuote(quote.id);
      if (result.success) {
        toast.success("Bozza eliminata");
        setData((prev) => prev.filter((q) => q.id !== quote.id));
      } else {
        toast.error(result.error);
      }
      setDeleting(null);
    });
  }

  const columns: ColumnDef<QuoteDoc>[] = [
    {
      accessorKey: "number",
      header: "Numero",
      size: 120,
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.original.number}</span>
      ),
    },
    {
      id: "client",
      header: "Cliente",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.clientSnapshot.displayName}</p>
          <p className="text-xs text-muted-foreground">{row.original.clientSnapshot.email}</p>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Stato",
      size: 140,
      cell: ({ row }) => <QuoteStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "totalCents",
      header: "Totale",
      size: 120,
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {formatEUR(row.original.totalCents)}
        </span>
      ),
    },
    {
      id: "actions",
      size: 100,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/quotes/${row.original.id}`)}
            aria-label="Apri preventivo"
          >
            <ChevronRight className="size-3.5" strokeWidth={1.75} />
          </Button>
          {row.original.status === "draft" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDeleting(row.original)}
              aria-label="Elimina bozza"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" strokeWidth={1.75} />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Preventivi</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Preventivi
          </h1>
          <p className="text-sm text-muted-foreground">
            {data.filter((q) => q.status === "draft").length} bozze ·{" "}
            {data.filter((q) => q.status === "pending_approval").length} in approvazione
          </p>
        </div>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            render={
              <Button>
                <Plus className="size-3.5" strokeWidth={1.75} />
                Nuovo preventivo
              </Button>
            }
          />
          <SheetContent
            side="right"
            className="overflow-y-auto"
          >
            <SheetHeader className="mb-6">
              <SheetTitle>Nuovo preventivo</SheetTitle>
            </SheetHeader>
            <QuoteForm
              clients={clients}
              analyses={analyses}
              defaultEnpaiaApplied={defaultEnpaiaApplied}
              defaultEnpaiaPercent={defaultEnpaiaPercent}
              onSuccess={(id) => {
                setSheetOpen(false);
                router.push(`/quotes/${id}`);
              }}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Filtri */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Cerca per numero o cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "draft", "pending_approval", "approved", "rejected", "cancelled"] as const).map(
            (s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(s)}
                className="text-xs"
              >
                {s === "all" ? "Tutti" : STATUS_LABELS[s]}
              </Button>
            ),
          )}
        </div>
      </div>

      {/* Tabella / empty state */}
      {filtered.length === 0 && !search && statusFilter === "all" ? (
        <div className="rounded-xl border border-border bg-card p-16 flex flex-col items-center gap-3 text-center">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center">
            <FileText className="size-5 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-foreground">Nessun preventivo</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Crea il primo preventivo con il pulsante &quot;Nuovo preventivo&quot;.
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          globalFilter={search}
          emptyMessage="Nessun preventivo trovato per i filtri selezionati."
        />
      )}

      {/* Dialog conferma eliminazione */}
      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elimina bozza</DialogTitle>
            <DialogDescription>
              La bozza <strong>{deleting?.number}</strong> sarà eliminata definitivamente.
              Questa operazione non può essere annullata.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleting && handleDelete(deleting)}
            >
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
