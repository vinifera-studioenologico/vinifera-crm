"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  User,
  MoreHorizontal,
  Pencil,
  Archive,
  RotateCcw,
  FileDown,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import type { ClientDoc } from "@/schemas/client";
import { archiveClient, restoreClient, exportClientData } from "@/server/actions/clients";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ClientForm } from "@/components/forms/ClientForm";

interface Props {
  client: ClientDoc;
}

export function ClientDetailHeader({ client }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [, startTransition] = useTransition();

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveClient(client.id);
      if (result.success) {
        toast.success("Cliente archiviato");
        router.push("/clients");
      } else {
        toast.error(result.error);
      }
      setArchiveOpen(false);
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreClient(client.id);
      if (result.success) {
        toast.success("Cliente ripristinato");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleExport() {
    startTransition(async () => {
      const result = await exportClientData(client.id);
      if (result.success) {
        const blob = new Blob(
          [JSON.stringify(result.data, null, 2)],
          { type: "application/json;charset=utf-8" },
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const dateStr = new Date().toISOString().slice(0, 10);
        const safeName = client.displayName.replace(/[^a-z0-9]/gi, "_");
        a.href = url;
        a.download = `dati_cliente_${safeName}_${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="border-b border-border bg-card px-4 md:px-6 py-4">
      <Breadcrumb className="mb-3">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/clients" />}>
              Clienti
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{client.displayName}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar */}
          <div
            className={cn(
              "size-10 rounded-full flex items-center justify-center shrink-0",
              client.type === "business"
                ? "bg-primary/10 text-primary"
                : "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
            )}
          >
            {client.type === "business" ? (
              <Building2 className="size-5" strokeWidth={1.5} />
            ) : (
              <User className="size-5" strokeWidth={1.5} />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold tracking-tight truncate">
                {client.displayName}
              </h1>
              {client.deletedAt !== null && (
                <Badge variant="outline" className="text-muted-foreground shrink-0">
                  Archiviato
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {client.email}
              {client.type === "business" && ` · P.IVA ${client.vatNumber}`}
            </p>
          </div>
        </div>

        {/* Azioni */}
        <div className="flex items-center gap-2 shrink-0 self-stretch md:self-auto">
          {/* Pulsante Modifica */}
          <Sheet open={editOpen} onOpenChange={setEditOpen}>
            <SheetTrigger
              render={
                <Button variant="outline" size="sm" className="flex-1 md:flex-none">
                  <Pencil className="size-3.5" strokeWidth={1.75} />
                  Modifica
                </Button>
              }
            />
            <SheetContent
              side="right"
              className="w-full sm:max-w-lg overflow-y-auto"
            >
              <SheetHeader className="mb-6">
                <SheetTitle>Modifica cliente</SheetTitle>
              </SheetHeader>
              <ClientForm
                existing={client}
                onSuccess={() => {
                  setEditOpen(false);
                  router.refresh();
                }}
              />
            </SheetContent>
          </Sheet>

          {/* Menu azioni aggiuntive */}
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="outline" size="icon" aria-label="Altre azioni">
                <MoreHorizontal className="size-4" strokeWidth={1.75} />
              </Button>
            } />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExport}>
                <FileDown className="size-3.5" strokeWidth={1.75} />
                Esporta dati (GDPR)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {client.deletedAt === null ? (
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setArchiveOpen(true)}
                >
                  <Archive className="size-3.5" strokeWidth={1.75} />
                  Archivia cliente
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={handleRestore}>
                  <RotateCcw className="size-3.5" strokeWidth={1.75} />
                  Ripristina cliente
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Dialog conferma archiviazione */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archivia cliente</DialogTitle>
            <DialogDescription>
              Il cliente <strong>{client.displayName}</strong> sarà archiviato.
              Tutti i dati storici rimarranno intatti.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>
              Annulla
            </Button>
            <Button variant="destructive" onClick={handleArchive}>
              Archivia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
