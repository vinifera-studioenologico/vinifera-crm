"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Archive, RotateCcw, Pencil, Globe } from "lucide-react";
import { toast } from "sonner";

import type { ServiceDoc } from "@/schemas/service";
import { archiveService, restoreService } from "@/server/actions/services";
import { cn } from "@/lib/utils";

import { DataTable } from "@/components/data-table/DataTable";
import { ServiceForm } from "@/components/forms/ServiceForm";
import { Button } from "@/components/ui/button";
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
  initialData: ServiceDoc[];
}

export function ServiziClient({ initialData }: Props) {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceDoc | null>(null);
  const [archiving, setArchiving] = useState<ServiceDoc | null>(null);
  const [, startTransition] = useTransition();

  const filtered = initialData.filter((s) => {
    if (!showArchived && s.deletedAt !== null) return false;
    if (showArchived && s.deletedAt === null) return false;
    return true;
  });

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(row: ServiceDoc) {
    setEditing(row);
    setSheetOpen(true);
  }

  function handleArchive(row: ServiceDoc) {
    startTransition(async () => {
      const result = await archiveService(row.id);
      if (result.success) {
        toast.success("Servizio archiviato");
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setArchiving(null);
    });
  }

  function handleRestore(row: ServiceDoc) {
    startTransition(async () => {
      const result = await restoreService(row.id);
      if (result.success) {
        toast.success("Servizio ripristinato");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const columns: ColumnDef<ServiceDoc>[] = [
    {
      accessorKey: "order",
      header: "Ordine",
      size: 70,
      cell: ({ row }) => (
        <span className="font-mono text-sm tabular-nums">{row.original.order}</span>
      ),
    },
    {
      accessorKey: "title",
      header: "Titolo (IT)",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-sm">{row.original.title.it}</p>
          <p className="text-xs text-muted-foreground truncate max-w-xs">{row.original.summary.it}</p>
        </div>
      ),
    },
    {
      accessorKey: "slug",
      header: "Slug",
      size: 160,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.slug}</span>
      ),
    },
    {
      accessorKey: "basePrice",
      header: "Prezzo",
      size: 140,
      cell: ({ row }) => {
        const doc = row.original;
        if (doc.basePrice === null) return <span className="text-muted-foreground text-sm">Su richiesta</span>;
        if (doc.discountedPrice !== null) {
          return (
            <span className="text-sm tabular-nums">
              <span className="line-through text-muted-foreground mr-1">€{doc.basePrice}</span>
              <span className="font-medium">€{doc.discountedPrice}</span>
            </span>
          );
        }
        return <span className="font-medium text-sm tabular-nums">€{doc.basePrice}</span>;
      },
    },
    {
      accessorKey: "inEvidenza",
      header: "In evidenza",
      size: 100,
      cell: ({ row }) => (
        <Badge variant={row.original.inEvidenza ? "default" : "outline"} className={cn(!row.original.inEvidenza && "text-muted-foreground")}>
          {row.original.inEvidenza ? "Sì" : "No"}
        </Badge>
      ),
    },
    {
      accessorKey: "available",
      header: "Disponibile",
      size: 100,
      cell: ({ row }) => (
        <Badge variant={row.original.available ? "default" : "secondary"} className={cn(!row.original.available && "text-muted-foreground")}>
          {row.original.available ? "Sì" : "Lista d'attesa"}
        </Badge>
      ),
    },
    {
      id: "actions",
      size: 100,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)} aria-label="Modifica">
            <Pencil className="size-3.5" strokeWidth={1.75} />
          </Button>
          {row.original.deletedAt === null ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setArchiving(row.original)}
              aria-label="Archivia"
              className="text-muted-foreground hover:text-destructive"
            >
              <Archive className="size-3.5" strokeWidth={1.75} />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleRestore(row.original)}
              aria-label="Ripristina"
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
    <>
      {/* Breadcrumb */}
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Servizi</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Globe className="size-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Servizi</h1>
          <Badge variant="secondary">{filtered.length}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="show-archived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
            <Label htmlFor="show-archived" className="text-sm cursor-pointer">
              Archiviati
            </Label>
          </div>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger
              render={
                <Button size="sm" onClick={openNew}>
                  <Plus className="size-4 mr-1.5" /> Nuovo servizio
                </Button>
              }
            />
            <SheetContent side="right" className="w-full max-w-2xl overflow-y-auto">
              <SheetHeader>
                <SheetTitle>{editing ? "Modifica servizio" : "Nuovo servizio"}</SheetTitle>
              </SheetHeader>
              <div className="mt-6">
                <ServiceForm
                  existing={editing ?? undefined}
                  onSuccess={() => {
                    setSheetOpen(false);
                    router.refresh();
                  }}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Table */}
      <DataTable columns={columns} data={filtered} />

      {/* Confirm archive dialog */}
      <Dialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archivia servizio</DialogTitle>
            <DialogDescription>
              Stai per archiviare <strong>{archiving?.title.it}</strong>. Il servizio non sarà più visibile sul sito.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiving(null)}>Annulla</Button>
            <Button variant="destructive" onClick={() => archiving && handleArchive(archiving)}>
              Archivia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
