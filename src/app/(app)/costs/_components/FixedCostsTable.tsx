"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { FixedCostDoc } from "@/schemas/cost";
import { deleteFixedCost } from "@/server/actions/costs";
import { formatEUR } from "@/lib/utils/money";
import { cn } from "@/lib/utils";

import { DataTable } from "@/components/data-table/DataTable";
import { FixedCostForm } from "@/components/forms/FixedCostForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
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
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Mensile",
  quarterly: "Trimestrale",
  annual: "Annuale",
};

function monthlyProrata(amountCents: number, frequency: string): number {
  if (frequency === "monthly") return amountCents;
  if (frequency === "quarterly") return Math.round(amountCents / 3);
  if (frequency === "annual") return Math.round(amountCents / 12);
  return amountCents;
}

interface Props {
  initialData: FixedCostDoc[];
}

export function FixedCostsTable({ initialData }: Props) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<FixedCostDoc | null>(null);
  const [deleting, setDeleting] = useState<FixedCostDoc | null>(null);
  const [, startTransition] = useTransition();

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(row: FixedCostDoc) {
    setEditing(row);
    setSheetOpen(true);
  }

  function handleDelete(row: FixedCostDoc) {
    startTransition(async () => {
      const result = await deleteFixedCost(row.id);
      if (result.success) {
        toast.success("Costo fisso eliminato");
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setDeleting(null);
    });
  }

  const columns: ColumnDef<FixedCostDoc>[] = [
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "description",
      header: "Descrizione",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.description ?? "—"}</span>
      ),
    },
    {
      accessorKey: "amountCents",
      header: "Importo",
      cell: ({ row }) => formatEUR(row.original.amountCents),
    },
    {
      accessorKey: "frequency",
      header: "Frequenza",
      cell: ({ row }) => (
        <Badge variant="secondary">
          {FREQUENCY_LABELS[row.original.frequency] ?? row.original.frequency}
        </Badge>
      ),
    },
    {
      id: "monthly",
      header: "Quota mensile",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatEUR(monthlyProrata(row.original.amountCents, row.original.frequency))}
        </span>
      ),
    },
    {
      accessorKey: "active",
      header: "Attivo",
      cell: ({ row }) => (
        <Badge variant={row.original.active ? "default" : "outline"}>
          {row.original.active ? "Attivo" : "Inattivo"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      size: 80,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => openEdit(row.original)}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive hover:text-destructive"
            onClick={() => setDeleting(row.original)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>Costi</BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Costi fissi</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="mt-2 text-2xl font-semibold">Costi fissi</h1>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 size-4" />
          Aggiungi
        </Button>
      </div>

      {/* Totale mensile */}
      {initialData.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Totale quota mensile:{" "}
          <span className="font-semibold text-foreground">
            {formatEUR(
              initialData.reduce(
                (sum, r) => sum + monthlyProrata(r.amountCents, r.frequency),
                0,
              ),
            )}
          </span>
        </p>
      )}

      <DataTable
        columns={columns}
        data={initialData}
        emptyMessage="Nessun costo fisso registrato."
      />

      {/* Sheet add/edit */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editing ? "Modifica costo fisso" : "Nuovo costo fisso"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <FixedCostForm
              existing={editing ?? undefined}
              onSuccess={() => {
                setSheetOpen(false);
                router.refresh();
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirm delete dialog */}
      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elimina costo fisso</DialogTitle>
            <DialogDescription>
              Elimina &ldquo;{deleting?.name}&rdquo;? L&apos;operazione non è reversibile.
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
