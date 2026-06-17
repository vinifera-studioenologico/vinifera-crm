"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

import type { ExpenseDoc } from "@/schemas/cost";
import { deleteExpense } from "@/server/actions/costs";
import { formatEUR } from "@/lib/utils/money";

import { DataTable } from "@/components/data-table/DataTable";
import { CsvExportButton } from "@/components/data-table/CsvExportButton";
import type { CsvColumn } from "@/lib/utils/csv";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

const CATEGORY_LABELS: Record<string, string> = {
  supplier_invoice: "Bolla fornitore",
  utility: "Bolletta",
  maintenance: "Manutenzione",
  consumable: "Materiale consumo",
  kit_purchase: "Acquisto kit",
  other: "Altro",
};

interface Props {
  initialData: ExpenseDoc[];
}

export function ExpensesTable({ initialData }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<ExpenseDoc | null>(null);
  const [, startTransition] = useTransition();

  function handleDelete(row: ExpenseDoc) {
    startTransition(async () => {
      const result = await deleteExpense(row.id);
      if (result.success) {
        toast.success("Spesa eliminata");
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setDeleting(null);
    });
  }

  const csvColumns: CsvColumn<ExpenseDoc>[] = [
    { header: "Data", accessor: (e) => e.date },
    { header: "Titolo", accessor: (e) => e.supplier ?? "" },
    { header: "Descrizione", accessor: (e) => e.description },
    { header: "Categoria", accessor: (e) => CATEGORY_LABELS[e.category] ?? e.category },
    { header: "N° Bolla", accessor: (e) => e.invoiceNumber ?? "" },
    { header: "Importo (€)", accessor: (e) => (e.totalCents / 100).toFixed(2).replace(".", ",") },
    { header: "Note", accessor: (e) => e.notes ?? "" },
  ];

  const columns: ColumnDef<ExpenseDoc>[] = [
    {
      accessorKey: "date",
      header: "Data",
      cell: ({ row }) => {
        try {
          return format(new Date(row.original.date), "dd/MM/yyyy", { locale: it });
        } catch {
          return row.original.date;
        }
      },
    },
    {
      accessorKey: "supplier",
      header: "Titolo",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.supplier ?? "—"}</span>
      ),
    },
    {
      accessorKey: "description",
      header: "Descrizione",
      cell: ({ row }) => (
        <Link
          href={`/costs/expenses/${row.original.id}`}
          className="font-medium hover:underline text-primary"
        >
          {row.original.description}
        </Link>
      ),
    },
    {
      accessorKey: "category",
      header: "Categoria",
      cell: ({ row }) => (
        <Badge variant="secondary">
          {CATEGORY_LABELS[row.original.category] ?? row.original.category}
        </Badge>
      ),
    },
    {
      accessorKey: "totalCents",
      header: "Importo",
      cell: ({ row }) => (
        <span className="font-semibold tabular-nums">{formatEUR(row.original.totalCents)}</span>
      ),
    },
    {
      id: "pdf",
      header: "PDF",
      size: 60,
      cell: ({ row }) =>
        row.original.pdfStoragePath ? (
          <FileText className="size-4 text-muted-foreground" />
        ) : null,
    },
    {
      accessorKey: "createdAt",
      header: "Inserimento",
      cell: ({ row }) => {
        try {
          const ts = row.original.createdAt;
          if (!ts) return "—";
          return format(new Date(ts), "dd/MM/yyyy HH:mm", { locale: it });
        } catch {
          return "—";
        }
      },
    },
    {
      id: "actions",
      header: "",
      size: 60,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-destructive hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            setDeleting(row.original);
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
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
                <BreadcrumbPage>Spese</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="mt-2 text-2xl font-semibold">Spese</h1>
        </div>
        <div className="flex items-center gap-2">
          <CsvExportButton data={initialData} columns={csvColumns} filenamePrefix="spese" />
          <Button onClick={() => router.push("/costs/expenses/new")}>
            <Plus className="mr-2 size-4" />
            Nuova spesa
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Input
          placeholder="Cerca spesa…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        {initialData.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Totale:{" "}
            <span className="font-semibold text-foreground">
              {formatEUR(initialData.reduce((s, e) => s + e.totalCents, 0))}
            </span>
          </p>
        )}
      </div>

      <DataTable
        columns={columns}
        data={initialData}
        globalFilter={search}
        initialSorting={[{ id: "date", desc: true }, { id: "createdAt", desc: true }]}
        emptyMessage="Nessuna spesa registrata."
        onRowClick={(row) => router.push(`/costs/expenses/${row.id}`)}
      />

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elimina spesa</DialogTitle>
            <DialogDescription>
              Elimina &ldquo;{deleting?.description}&rdquo;? L&apos;operazione non è reversibile.
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
