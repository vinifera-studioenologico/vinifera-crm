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
  Package,
} from "lucide-react";
import { toast } from "sonner";

import type { PackageDoc } from "@/schemas/package";
import { archivePackage, restorePackage } from "@/server/actions/packages";
import { formatEUR } from "@/lib/utils/money";
import { cn } from "@/lib/utils";

import { DataTable } from "@/components/data-table/DataTable";
import { PackageForm } from "@/components/forms/PackageForm";
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
  initialData: PackageDoc[];
}

export function PackagesClient({ initialData }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PackageDoc | null>(null);
  const [archiving, setArchiving] = useState<PackageDoc | null>(null);
  const [, startTransition] = useTransition();

  const filtered = initialData.filter((p) => {
    if (!showArchived && p.deletedAt !== null) return false;
    if (showArchived && p.deletedAt === null) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.description?.toLowerCase().includes(q) ?? false)
    );
  });

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(row: PackageDoc) {
    setEditing(row);
    setSheetOpen(true);
  }

  function handleArchive(row: PackageDoc) {
    startTransition(async () => {
      const result = await archivePackage(row.id);
      if (result.success) {
        toast.success("Pacchetto archiviato");
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setArchiving(null);
    });
  }

  function handleRestore(row: PackageDoc) {
    startTransition(async () => {
      const result = await restorePackage(row.id);
      if (result.success) {
        toast.success("Pacchetto ripristinato");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const columns: ColumnDef<PackageDoc>[] = [
    {
      accessorKey: "name",
      header: "Nome pacchetto",
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
      accessorKey: "totalAnalyses",
      header: "N. analisi",
      size: 110,
      cell: ({ row }) => (
        <span className="tabular-nums font-medium">{row.original.totalAnalyses}</span>
      ),
    },
    {
      accessorKey: "priceCents",
      header: "Prezzo",
      size: 120,
      cell: ({ row }) => (
        <div>
          <p className="font-medium tabular-nums">{formatEUR(row.original.priceCents)}</p>
          {row.original.totalAnalyses > 0 && (
            <p className="text-xs text-muted-foreground">
              {formatEUR(Math.round(row.original.priceCents / row.original.totalAnalyses))}/analisi
            </p>
          )}
        </div>
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
          {row.original.active ? "Attivo" : "Inattivo"}
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
            aria-label="Modifica pacchetto"
          >
            <Pencil className="size-3.5" strokeWidth={1.75} />
          </Button>
          {row.original.deletedAt === null ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setArchiving(row.original)}
              aria-label="Archivia pacchetto"
              className="text-muted-foreground hover:text-destructive"
            >
              <Archive className="size-3.5" strokeWidth={1.75} />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleRestore(row.original)}
              aria-label="Ripristina pacchetto"
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
                <BreadcrumbPage>Pacchetti</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Listino pacchetti
          </h1>
          <p className="text-sm text-muted-foreground">
            {initialData.filter((p) => p.deletedAt === null).length} pacchetti nel listino attivo
          </p>
        </div>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            render={
              <Button onClick={openNew} className="w-full md:w-auto">
                <Plus className="size-3.5" strokeWidth={1.75} />
                Nuovo pacchetto
              </Button>
            }
          />
          <SheetContent side="right" className="overflow-y-auto">
            <SheetHeader className="mb-6">
              <SheetTitle>{editing ? "Modifica pacchetto" : "Nuovo pacchetto"}</SheetTitle>
            </SheetHeader>
            <PackageForm
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
            placeholder="Cerca per nome o descrizione..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2 md:ml-auto">
          <Label htmlFor="show-archived-pkg" className="text-sm text-muted-foreground cursor-pointer">
            Mostra archiviati
          </Label>
          <Switch
            id="show-archived-pkg"
            checked={showArchived}
            onCheckedChange={setShowArchived}
          />
        </div>
      </div>

      {/* Tabella */}
      {filtered.length === 0 && !search ? (
        <div className="rounded-xl border border-border bg-card p-16 flex flex-col items-center gap-3 text-center">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center">
            <Package className="size-5 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-foreground">
            {showArchived ? "Nessun pacchetto archiviato" : "Listino vuoto"}
          </p>
          {!showArchived && (
            <p className="text-xs text-muted-foreground max-w-xs">
              Aggiungi il primo pacchetto al listino con il pulsante &quot;Nuovo pacchetto&quot;.
            </p>
          )}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          globalFilter={search}
          emptyMessage={
            showArchived
              ? "Nessun pacchetto archiviato corrisponde alla ricerca."
              : "Nessun pacchetto trovato per questa ricerca."
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
            <DialogTitle>Archivia pacchetto</DialogTitle>
            <DialogDescription>
              Il pacchetto <strong>{archiving?.name}</strong> sarà archiviato e non sarà
              più acquistabile. I pacchetti già attivi per i clienti continueranno a funzionare.
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
