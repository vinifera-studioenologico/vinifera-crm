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
  Mail,
  Send,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import type { QuoteDoc, QuoteStatus } from "@/schemas/quote";
import type { ClientDoc } from "@/schemas/client";
import type { AnalysisDoc } from "@/schemas/analysis";
import type { PackageDoc } from "@/schemas/package";
import { deleteQuote, sendQuoteByEmail } from "@/server/actions/quotes";
import { formatEUR } from "@/lib/utils/money";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { sharePdf } from "@/lib/utils/share";

import { DataTable } from "@/components/data-table/DataTable";
import { CsvExportButton } from "@/components/data-table/CsvExportButton";
import { QuoteForm } from "@/components/forms/QuoteForm";
import { QuoteStatusBadge } from "@/components/widgets/QuoteStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  packages: PackageDoc[];
  defaultEnpaiaApplied?: boolean;
  defaultEnpaiaPercent?: number;
}

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Bozze",
  pending_approval: "In approvazione",
  approved: "Approvati",
  rejected: "Rifiutati",
  cancelled: "Annullati",
  superseded: "Sostituiti",
};

export function QuotesClient({ initialData, clients, analyses, packages, defaultEnpaiaApplied, defaultEnpaiaPercent }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "all">("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState<QuoteDoc | null>(null);
  const [emailTarget, setEmailTarget] = useState<QuoteDoc | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [, startTransition] = useTransition();
  const [isSending, startSend] = useTransition();
  const [isWhatsApp, setIsWhatsApp] = useState(false);

  function openEmail(quote: QuoteDoc) {
    setEmailTarget(quote);
    setEmailTo(quote.clientSnapshot.email ?? "");
    setEmailSubject(`Preventivo ${quote.number} — ${quote.clientSnapshot.displayName}`);
    setEmailBody(`Gentile cliente,\n\nin allegato il preventivo ${quote.number}.\n\nCordiali saluti`);
  }

  function handleWhatsApp(quote: QuoteDoc) {
    setIsWhatsApp(true);
    const clientSlug = quote.clientSnapshot.displayName.replace(/\s+/g, '_').replace(/[/\\:*?"<>|]/g, '');
    const filename = `preventivo-${quote.number.replace("/", "-")}_${clientSlug}.pdf`;
    sharePdf(`/api/pdf/quote/${quote.id}`, filename)
      .then((result) => {
        if (result === "downloaded")
          toast.info("PDF scaricato — allegalo su WhatsApp manualmente");
        else if (result === "error")
          toast.error("Errore durante la generazione del PDF");
      })
      .finally(() => setIsWhatsApp(false));
  }

  function handleSendEmail() {
    if (!emailTarget) return;
    startSend(async () => {
      const result = await sendQuoteByEmail(emailTarget.id, {
        to: emailTo,
        subject: emailSubject,
        body: emailBody,
      });
      if (result.success) {
        toast.success("Preventivo inviato via email");
        setEmailTarget(null);
      } else {
        toast.error(result.error);
      }
    });
  }

  const filtered = initialData.filter((q) => {
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
        router.refresh();
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
            onClick={() => openEmail(row.original)}
            aria-label="Invia via email"
          >
            <Mail className="size-3.5" strokeWidth={1.75} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleWhatsApp(row.original)}
            disabled={isWhatsApp}
            aria-label="Condividi su WhatsApp"
          >
            <WhatsAppIcon className="size-3.5" />
          </Button>
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
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="min-w-0">
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
            {initialData.filter((q) => q.status === "draft").length} bozze ·{" "}
            {initialData.filter((q) => q.status === "pending_approval").length} in approvazione
          </p>
        </div>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            render={
              <Button className="w-full md:w-auto">
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
              packages={packages}
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
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-3 md:flex-wrap">
        <div className="relative w-full md:flex-1 md:min-w-48 md:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Cerca per numero o cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "draft", "pending_approval", "approved", "rejected", "cancelled", "superseded"] as const).map(
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
        <CsvExportButton
          data={filtered}
          columns={[
            { header: "Numero", accessor: (q: QuoteDoc) => q.number },
            { header: "Cliente", accessor: (q: QuoteDoc) => q.clientSnapshot.displayName },
            { header: "Email cliente", accessor: (q: QuoteDoc) => q.clientSnapshot.email ?? "" },
            { header: "Stato", accessor: (q: QuoteDoc) => STATUS_LABELS[q.status] },
            { header: "Totale (\u20ac)", accessor: (q: QuoteDoc) => (q.totalCents / 100).toFixed(2).replace(".", ",") },
            { header: "Note", accessor: (q: QuoteDoc) => q.notes ?? "" },
          ]}
          filenamePrefix="preventivi"
        />
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

      {/* Dialog invio email */}
      <Dialog open={!!emailTarget} onOpenChange={(open) => !open && setEmailTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invia preventivo via email</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>A (email)</Label>
              <Input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="cliente@email.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Oggetto</Label>
              <Input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Corpo messaggio</Label>
              <Textarea
                rows={4}
                className="resize-none"
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailTarget(null)}>
              Annulla
            </Button>
            <Button disabled={isSending || !emailTo} onClick={handleSendEmail}>
              {isSending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" strokeWidth={1.75} />
              )}
              {isSending ? "Invio..." : "Invia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
