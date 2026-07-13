"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  Search,
  Archive,
  RotateCcw,
  Building2,
  User,
  ChevronRight,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import type { ClientDoc } from "@/schemas/client";
import { archiveClient, restoreClient } from "@/server/actions/clients";
import { cn } from "@/lib/utils";

import { DataTable } from "@/components/data-table/DataTable";
import { CsvExportButton } from "@/components/data-table/CsvExportButton";
import { ClientForm } from "@/components/forms/ClientForm";
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
import { formatEUR } from "@/lib/utils/money";

interface Props {
  initialData: ClientDoc[];
}

export function ClientsClient({ initialData }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [archiving, setArchiving] = useState<ClientDoc | null>(null);
  const [, startTransition] = useTransition();

  const filtered = initialData.filter((c) => {
    if (!showArchived && c.deletedAt !== null) return false;
    if (showArchived && c.deletedAt === null) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.displayName.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.type === "business" && c.vatNumber.toLowerCase().includes(q)) ||
      (c.type === "individual" &&
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q))
    );
  });

  function handleArchive(row: ClientDoc) {
    startTransition(async () => {
      const result = await archiveClient(row.id);
      if (result.success) {
        toast.success("Cliente archiviato");
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setArchiving(null);
    });
  }

  function handleRestore(row: ClientDoc) {
    startTransition(async () => {
      const result = await restoreClient(row.id);
      if (result.success) {
        toast.success("Cliente ripristinato");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const columns: ColumnDef<ClientDoc>[] = [
    {
      accessorKey: "displayName",
      header: "Cliente",
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                "size-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold",
                c.type === "business"
                  ? "bg-primary/10 text-primary"
                  : "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
              )}
            >
              {c.type === "business" ? (
                <Building2 className="size-4" strokeWidth={1.5} />
              ) : (
                <User className="size-4" strokeWidth={1.5} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm text-foreground truncate">
                {c.displayName}
              </p>
              <p className="text-xs text-muted-foreground truncate">{c.email}</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground md:hidden" strokeWidth={1.5} />
          </div>
        );
      },
    },
    {
      accessorKey: "type",
      header: "Tipo",
      size: 100,
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => (
        <Badge variant="secondary" className="font-normal text-xs">
          {row.original.type === "business" ? "Azienda" : "Privato"}
        </Badge>
      ),
    },
    {
      id: "vatNumber",
      header: "P.IVA / CF",
      size: 150,
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => {
        const c = row.original;
        const code =
          c.type === "business" ? c.vatNumber : (c.taxCode ?? "—");
        return (
          <span className="font-mono text-xs text-muted-foreground">{code}</span>
        );
      },
    },
    {
      id: "pendingAmount",
      header: "Pendente",
      size: 110,
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => {
        const cents = row.original.stats.pendingAmountCents;
        return (
          <span
            className={cn(
              "tabular-nums text-sm",
              cents > 0 ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {cents > 0 ? formatEUR(cents) : "—"}
          </span>
        );
      },
    },
    {
      id: "remainingAnalyses",
      header: "Campioni attivi",
      size: 130,
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => {
        const n = row.original.stats.samplesPending;
        return (
          <span
            className={cn(
              "tabular-nums text-sm",
              n > 0 ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {n > 0 ? n : "—"}
          </span>
        );
      },
    },
    {
      id: "actions",
      size: 100,
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/clients/${row.original.id}`)}
            aria-label="Apri scheda cliente"
          >
            <ChevronRight className="size-3.5" strokeWidth={1.75} />
          </Button>
          {row.original.deletedAt === null ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setArchiving(row.original)}
              aria-label="Archivia cliente"
              className="text-muted-foreground hover:text-destructive"
            >
              <Archive className="size-3.5" strokeWidth={1.75} />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleRestore(row.original)}
              aria-label="Ripristina cliente"
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
                <BreadcrumbPage>Clienti</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Clienti
          </h1>
          <p className="text-sm text-muted-foreground">
            {initialData.filter((c) => c.deletedAt === null).length} clienti attivi
          </p>
        </div>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            render={
              <Button className="w-full md:w-auto">
                <Plus className="size-3.5" strokeWidth={1.75} />
                Nuovo cliente
              </Button>
            }
          />
          <SheetContent
            side="right"
            className="w-full sm:max-w-lg overflow-y-auto"
          >
            <SheetHeader className="mb-6">
              <SheetTitle>Nuovo cliente</SheetTitle>
            </SheetHeader>
            <ClientForm
              onSuccess={(id) => {
                setSheetOpen(false);
                router.push(`/clients/${id}`);
              }}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-3 md:flex-wrap">
        <div className="relative w-full md:flex-1 md:min-w-48 md:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Cerca per nome, email o P.IVA..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2 md:ml-auto">
          <CsvExportButton
            data={filtered}
            columns={[
              { header: "Nome", accessor: (c: ClientDoc) => c.displayName },
              { header: "Tipo", accessor: (c: ClientDoc) => c.type === "business" ? "Azienda" : "Privato" },
              { header: "Email", accessor: (c: ClientDoc) => c.email },
              { header: "P.IVA / CF", accessor: (c: ClientDoc) => c.type === "business" ? c.vatNumber : (c.taxCode ?? "") },
              { header: "Telefono", accessor: (c: ClientDoc) => c.phone ?? "" },
              { header: "Pendente (\u20ac)", accessor: (c: ClientDoc) => (c.stats.pendingAmountCents / 100).toFixed(2).replace(".", ",") },
            ]}
            filenamePrefix="clienti"
          />
          <Label
            htmlFor="show-archived-clients"
            className="text-sm text-muted-foreground cursor-pointer"
          >
            Mostra archiviati
          </Label>
          <Switch
            id="show-archived-clients"
            checked={showArchived}
            onCheckedChange={setShowArchived}
          />
        </div>
      </div>

      {/* Tabella / Empty state */}
      {filtered.length === 0 && !search ? (
        <div className="rounded-xl border border-border bg-card p-16 flex flex-col items-center gap-3 text-center">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center">
            <Users className="size-5 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-foreground">
            {showArchived ? "Nessun cliente archiviato" : "Nessun cliente ancora"}
          </p>
          {!showArchived && (
            <p className="text-xs text-muted-foreground max-w-xs">
              Aggiungi il primo cliente con il pulsante &quot;Nuovo cliente&quot;.
            </p>
          )}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          emptyMessage={
            showArchived
              ? "Nessun cliente archiviato corrisponde alla ricerca."
              : "Nessun cliente trovato per questa ricerca."
          }
          rowClassName={(row) => (row.deletedAt !== null ? "opacity-50" : "")}
          onRowClick={(row) => router.push(`/clients/${row.id}`)}
        />
      )}

      {/* Dialog conferma archiviazione */}
      <Dialog
        open={!!archiving}
        onOpenChange={(open) => !open && setArchiving(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archivia cliente</DialogTitle>
            <DialogDescription>
              Il cliente <strong>{archiving?.displayName}</strong> sarà archiviato.
              Tutti i dati storici (campioni, preventivi, pagamenti) rimarranno
              intatti e consultabili.
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
