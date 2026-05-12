"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  Loader2,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import type { QuoteDoc, QuoteStatus } from "@/schemas/quote";
import type { AnalysisDoc } from "@/schemas/analysis";
import type { ClientDoc } from "@/schemas/client";
import { transitionQuote } from "@/server/actions/quotes";
import { isQuoteTransitionAllowed } from "@/schemas/quote";
import { formatEUR } from "@/lib/utils/money";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { QuoteStatusBadge } from "@/components/widgets/QuoteStatusBadge";
import { QuoteForm } from "@/components/forms/QuoteForm";

// Configurazione pulsanti transizione stato
const TRANSITION_BUTTONS: Array<{
  to: QuoteStatus;
  label: string;
  icon: React.ElementType;
  variant: "default" | "outline" | "destructive";
}> = [
  { to: "pending_approval", label: "Invia per approvazione", icon: Clock, variant: "default" },
  { to: "approved", label: "Approva", icon: CheckCircle2, variant: "default" },
  { to: "rejected", label: "Rifiuta", icon: XCircle, variant: "destructive" },
  { to: "cancelled", label: "Annulla", icon: Ban, variant: "destructive" },
];

interface Props {
  quote: QuoteDoc;
  clients: ClientDoc[];
  analyses: AnalysisDoc[];
  defaultEnpaiaApplied?: boolean;
  defaultEnpaiaPercent?: number;
}

export function QuoteDetailClient({ quote, clients, analyses, defaultEnpaiaApplied, defaultEnpaiaPercent }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmTransition, setConfirmTransition] = useState<QuoteStatus | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleTransition(to: QuoteStatus) {
    startTransition(async () => {
      const result = await transitionQuote(quote.id, to, quote.version);
      if (result.success) {
        toast.success("Stato aggiornato");
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setConfirmTransition(null);
    });
  }

  const allowedTransitions = TRANSITION_BUTTONS.filter((btn) =>
    isQuoteTransitionAllowed(quote.status, btn.to),
  );

  const issuedDate = quote.issuedAt
    ? new Date(
        (quote.issuedAt as { toDate?: () => Date }).toDate?.() ?? quote.issuedAt as Date,
      ).toLocaleDateString("it-IT")
    : "—";

  const validUntilDate = quote.validUntil
    ? new Date(
        (quote.validUntil as { toDate?: () => Date }).toDate?.() ?? quote.validUntil as Date,
      ).toLocaleDateString("it-IT")
    : null;

  return (
    <div className="p-4 md:p-6 max-w-4xl space-y-6">
      {/* Breadcrumb + header */}
      <div>
        <Breadcrumb className="mb-3">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>
                <Link href="/quotes" className="hover:text-foreground transition-colors">
                  Preventivi
                </Link>
              </BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{quote.number}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                Preventivo {quote.number}
              </h1>
              <QuoteStatusBadge status={quote.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {quote.clientSnapshot.displayName} · Emesso il {issuedDate}
              {validUntilDate && ` · Valido fino al ${validUntilDate}`}
            </p>
          </div>

          {/* Azioni */}
          <div className="flex gap-2 flex-wrap">
            {/* Download PDF */}
            <a
              href={`/api/pdf/quote/${quote.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <Download className="size-3.5" strokeWidth={1.75} />
                PDF
              </Button>
            </a>

            {quote.status === "draft" && (
              <Sheet open={editOpen} onOpenChange={setEditOpen}>
                <SheetTrigger
                  render={
                    <Button variant="outline" size="sm">
                      <Pencil className="size-3.5" strokeWidth={1.75} />
                      Modifica
                    </Button>
                  }
                />
                <SheetContent
                  side="right"
                  className="overflow-y-auto"
                >
                  <SheetHeader className="mb-6">
                    <SheetTitle>Modifica preventivo {quote.number}</SheetTitle>
                  </SheetHeader>
                  <QuoteForm
                    existing={quote}
                    clients={clients}
                    analyses={analyses}
                    defaultEnpaiaApplied={defaultEnpaiaApplied}
                    defaultEnpaiaPercent={defaultEnpaiaPercent}
                    onSuccess={() => {
                      setEditOpen(false);
                      router.refresh();
                    }}
                  />
                </SheetContent>
              </Sheet>
            )}

            {allowedTransitions.map((btn) => (
              <Button
                key={btn.to}
                variant={btn.variant}
                size="sm"
                disabled={isPending}
                onClick={() => {
                  if (btn.to === "cancelled" || btn.to === "rejected") {
                    setConfirmTransition(btn.to);
                  } else {
                    handleTransition(btn.to);
                  }
                }}
              >
                {isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <btn.icon className="size-3.5" strokeWidth={1.75} />
                )}
                {btn.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Dati cliente */}
      <div className="rounded-xl border border-border bg-card p-5 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Cliente</p>
          <p className="font-medium">{quote.clientSnapshot.displayName}</p>
          <p className="text-sm text-muted-foreground">{quote.clientSnapshot.email}</p>
          {quote.clientSnapshot.vatNumber && (
            <p className="text-sm text-muted-foreground font-mono">
              P.IVA {quote.clientSnapshot.vatNumber}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Indirizzo fatturazione</p>
          {quote.clientSnapshot.address ? (
            <>
              <p className="text-sm">{quote.clientSnapshot.address.street}</p>
              <p className="text-sm">
                {[quote.clientSnapshot.address.zip, quote.clientSnapshot.address.city]
                  .filter(Boolean)
                  .join(" ")}
                {quote.clientSnapshot.address.province &&
                  ` (${quote.clientSnapshot.address.province})`}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </div>
      </div>

      {/* Voci */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_120px_120px] gap-2 bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground">
          <span>Descrizione</span>
          <span className="text-right">Q.tà</span>
          <span className="text-right">Prezzo unit.</span>
          <span className="text-right">Totale</span>
        </div>
        <div className="divide-y divide-border">
          {quote.items.map((item, i) => {
            const lineTotal = Math.round(item.unitPriceCents * item.quantity);
            const desc =
              item.kind === "free"
                ? item.description
                : item.kind === "analysis"
                  ? item.nameSnapshot
                  : item.nameSnapshot;
            return (
              <div
                key={i}
                className="grid grid-cols-[1fr_80px_120px_120px] gap-2 px-4 py-3 items-center"
              >
                <div>
                  <p className="text-sm font-medium">{desc}</p>
                </div>
                <span className="text-sm text-right tabular-nums">{item.quantity}</span>
                <span className="text-sm text-right tabular-nums">
                  {formatEUR(item.unitPriceCents)}
                </span>
                <span className="text-sm text-right tabular-nums font-medium">
                  {formatEUR(lineTotal)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Totali */}
        <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotale</span>
            <span className="tabular-nums">{formatEUR(quote.subtotalCents)}</span>
          </div>
          {quote.discounts.map((d, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{d.label}</span>
              <span className="tabular-nums text-red-600 dark:text-red-400">
                {d.type === "percent"
                  ? `−${d.value}%`
                  : `−${formatEUR(Math.round(d.value * 100))}`}
              </span>
            </div>
          ))}
          {quote.taxes.filter((t) => t.applied).map((t, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t.label}</span>
              <span className="tabular-nums">+{t.percent}%</span>
            </div>
          ))}
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Totale</span>
            <span className="tabular-nums text-lg">{formatEUR(quote.totalCents)}</span>
          </div>
        </div>
      </div>

      {/* Note */}
      {quote.notes && (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground mb-2">Note</p>
          <p className="text-sm whitespace-pre-wrap">{quote.notes}</p>
        </div>
      )}

      {/* Dialogs di conferma per azioni irreversibili */}
      <Dialog
        open={!!confirmTransition}
        onOpenChange={(open) => !open && setConfirmTransition(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmTransition === "cancelled" ? "Annulla preventivo" : "Rifiuta preventivo"}
            </DialogTitle>
            <DialogDescription>
              {confirmTransition === "cancelled"
                ? `Il preventivo ${quote.number} sarà annullato. Questa operazione non può essere invertita.`
                : `Il preventivo ${quote.number} sarà contrassegnato come rifiutato.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTransition(null)}>
              Annulla
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => confirmTransition && handleTransition(confirmTransition)}
            >
              {isPending && <Loader2 className="size-3.5 animate-spin" />}
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
