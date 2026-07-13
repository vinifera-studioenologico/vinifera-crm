"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  Search,
  Archive,
  RotateCcw,
  Pencil,
  FlaskConical,
} from "lucide-react";
import { toast } from "sonner";

import type { AnalysisDoc } from "@/schemas/analysis";
import { archiveAnalysis, restoreAnalysis } from "@/server/actions/analyses";
import { formatEUR } from "@/lib/utils/money";
import { cn } from "@/lib/utils";

import { DataTable } from "@/components/data-table/DataTable";
import { CsvExportButton } from "@/components/data-table/CsvExportButton";
import { AnalysisForm } from "@/components/forms/AnalysisForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { Label } from "@/components/ui/label";

interface Props {
  initialData: AnalysisDoc[];
}

export function AnalysesClient({ initialData }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<AnalysisDoc | null>(null);
  const [archiving, setArchiving] = useState<AnalysisDoc | null>(null);
  const [, startTransition] = useTransition();

  // Filtra localmente — i dati vengono ricaricati via revalidatePath lato server
  const filtered = initialData.filter((a) => {
    if (!showArchived && a.deletedAt !== null) return false;
    if (showArchived && a.deletedAt === null) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.code.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      (a.category?.toLowerCase().includes(q) ?? false)
    );
  });

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(row: AnalysisDoc) {
    setEditing(row);
    setSheetOpen(true);
  }

  function handleArchive(row: AnalysisDoc) {
    startTransition(async () => {
      const result = await archiveAnalysis(row.id);
      if (result.success) {
        toast.success("Analisi archiviata");
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setArchiving(null);
    });
  }

  function handleRestore(row: AnalysisDoc) {
    startTransition(async () => {
      const result = await restoreAnalysis(row.id);
      if (result.success) {
        toast.success("Analisi ripristinata");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const columns: ColumnDef<AnalysisDoc>[] = [
    {
      accessorKey: "code",
      header: "Codice",
      size: 100,
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.original.code}</span>
      ),
    },
    {
      accessorKey: "name",
      header: "Nome analisi",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-foreground text-sm">{row.original.name}</p>
          {row.original.description && (
            <p className="text-xs text-muted-foreground truncate max-w-xs">
              {row.original.description}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "category",
      header: "Categoria",
      size: 160,
      cell: ({ row }) =>
        row.original.category ? (
          <Badge variant="secondary" className="font-normal">
            {row.original.category}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    {
      accessorKey: "defaultPriceCents",
      header: "Prezzo",
      size: 110,
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {formatEUR(row.original.defaultPriceCents)}
        </span>
      ),
    },
    {
      accessorKey: "unit",
      header: "Unità",
      size: 80,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {row.original.unit ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "active",
      header: "Stato",
      size: 90,
      cell: ({ row }) => (
        <Badge
          variant={row.original.active ? "default" : "outline"}
          className={cn(!row.original.active && "text-muted-foreground")}
        >
          {row.original.active ? "Attiva" : "Inattiva"}
        </Badge>
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
            onClick={() => openEdit(row.original)}
            aria-label="Modifica analisi"
          >
            <Pencil className="size-3.5" strokeWidth={1.75} />
          </Button>
          {row.original.deletedAt === null ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setArchiving(row.original)}
              aria-label="Archivia analisi"
              className="text-muted-foreground hover:text-destructive"
            >
              <Archive className="size-3.5" strokeWidth={1.75} />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleRestore(row.original)}
              aria-label="Ripristina analisi"
              className="text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3.5" strokeWidth={1.75} />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="min-w-0">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Analisi</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Listino analisi
          </h1>
          <p className="text-sm text-muted-foreground">
            {initialData.filter((a) => a.deletedAt === null).length} analisi nel listino attivo
          </p>
        </div>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            render={
              <Button onClick={openNew} className="w-full md:w-auto">
                <Plus className="size-3.5" strokeWidth={1.75} />
                Nuova analisi
              </Button>
            }
          />
          <SheetContent side="right" className="overflow-y-auto">
            <SheetHeader className="mb-8">
              <SheetTitle>{editing ? "Modifica analisi" : "Nuova analisi"}</SheetTitle>
            </SheetHeader>
            <AnalysisForm
              existing={editing ?? undefined}
              onSuccess={() => { setSheetOpen(false); router.refresh(); }}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-3 md:flex-wrap">
        <div className="relative w-full md:flex-1 md:min-w-48 md:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Cerca per codice, nome o categoria..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2 md:ml-auto">
          <CsvExportButton
            data={filtered}
            columns={[
              { header: "Codice", accessor: (a: AnalysisDoc) => a.code },
              { header: "Nome", accessor: (a: AnalysisDoc) => a.name },
              { header: "Categoria", accessor: (a: AnalysisDoc) => a.category ?? "" },
              { header: "Prezzo (\u20ac)", accessor: (a: AnalysisDoc) => (a.defaultPriceCents / 100).toFixed(2).replace(".", ",") },
              { header: "Unit\u00e0", accessor: (a: AnalysisDoc) => a.unit ?? "" },
              { header: "Stato", accessor: (a: AnalysisDoc) => a.active ? "Attiva" : "Inattiva" },
            ]}
            filenamePrefix="analisi"
          />
          <Label htmlFor="show-archived" className="text-sm text-muted-foreground cursor-pointer">
            Mostra archiviate
          </Label>
          <Switch
            id="show-archived"
            checked={showArchived}
            onCheckedChange={setShowArchived}
          />
        </div>
      </div>

      {/* Tabella */}
      {filtered.length === 0 && !search ? (
        <div className="rounded-xl border border-border bg-card p-16 flex flex-col items-center gap-3 text-center">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center">
            <FlaskConical className="size-5 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-foreground">
            {showArchived ? "Nessuna analisi archiviata" : "Listino vuoto"}
          </p>
          {!showArchived && (
            <p className="text-xs text-muted-foreground max-w-xs">
              Aggiungi la prima analisi al listino con il pulsante &quot;Nuova analisi&quot;.
            </p>
          )}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          emptyMessage={
            showArchived
              ? "Nessuna analisi archiviata corrisponde alla ricerca."
              : "Nessuna analisi trovata per questa ricerca."
          }
          rowClassName={(row) =>
            row.deletedAt !== null ? "opacity-50" : ""
          }
        />
      )}

      {/* Dialog conferma archiviazione */}
      <Dialog open={!!archiving} onOpenChange={(open) => !open && setArchiving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archivia analisi</DialogTitle>
            <DialogDescription>
              L&apos;analisi <strong>{archiving?.name}</strong> ({archiving?.code}) sarà
              archiviata e non sarà più selezionabile in nuovi campioni e preventivi.
              I dati storici resteranno intatti.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiving(null)}>
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={() => archiving && handleArchive(archiving)}
            >
              Archivia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
