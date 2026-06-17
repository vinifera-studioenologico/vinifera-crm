"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Trash2, PackageSearch } from "lucide-react";
import { toast } from "sonner";

import type { KitDoc } from "@/schemas/cost";
import type { AnalysisDoc } from "@/schemas/analysis";
import { deleteKit } from "@/server/actions/costs";
import { formatEUR } from "@/lib/utils/money";

import { DataTable } from "@/components/data-table/DataTable";
import { KitForm } from "@/components/forms/KitForm";
import { Button } from "@/components/ui/button";
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

interface Props {
  initialData: KitDoc[];
  analyses: AnalysisDoc[];
}

export function KitsTable({ initialData, analyses }: Props) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<KitDoc | null>(null);
  const [deleting, setDeleting] = useState<KitDoc | null>(null);
  const [, startTransition] = useTransition();

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(row: KitDoc) {
    setEditing(row);
    setSheetOpen(true);
  }

  function handleDelete(row: KitDoc) {
    startTransition(async () => {
      const result = await deleteKit(row.id);
      if (result.success) {
        toast.success("Kit eliminato");
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setDeleting(null);
    });
  }

  const columns: ColumnDef<KitDoc>[] = [
    {
      accessorKey: "supplierArticleCode",
      header: "Codice fornitore",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.supplierArticleCode}</span>
      ),
    },
    {
      accessorKey: "name",
      header: "Nome kit",
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      id: "analysis",
      header: "Analisi",
      cell: ({ row }) => (
        <Link
          href={`/analyses`}
          className="text-sm text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.original.analysisCodeSnapshot} — {row.original.analysisNameSnapshot}
        </Link>
      ),
    },
    {
      accessorKey: "numberOfTests",
      header: "N° test",
      cell: ({ row }) => row.original.numberOfTests.toLocaleString("it-IT"),
    },
    {
      accessorKey: "lastPurchasePriceCents",
      header: "Prezzo kit",
      cell: ({ row }) => formatEUR(row.original.lastPurchasePriceCents),
    },
    {
      accessorKey: "costPerTestCents",
      header: "Costo/test",
      cell: ({ row }) => (
        <span className="font-semibold">{formatEUR(row.original.costPerTestCents)}</span>
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>Costi</BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Kit</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="mt-2 text-2xl font-semibold">Kit</h1>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 size-4" />
          Aggiungi kit
        </Button>
        <Button variant="outline" onClick={() => router.push("/costs/kits/import")}>
          <PackageSearch className="mr-2 size-4" />
          Importa da offerta
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={initialData}
        emptyMessage="Nessun kit registrato."
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Modifica kit" : "Nuovo kit"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <KitForm
              existing={editing ?? undefined}
              analyses={analyses}
              onSuccess={() => {
                setSheetOpen(false);
                router.refresh();
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete dialog */}
      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elimina kit</DialogTitle>
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
