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
  Mail,
  Send,
  Package,
  CopyPlus,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import type { QuoteDoc, QuoteStatus } from "@/schemas/quote";
import type { AnalysisDoc } from "@/schemas/analysis";
import type { ClientDoc } from "@/schemas/client";
import type { PackageDoc } from "@/schemas/package";
import { transitionQuote, sendQuoteByEmail, createQuoteRevision } from "@/server/actions/quotes";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { sharePdf } from "@/lib/utils/share";
import { createManualPayment } from "@/server/actions/payments";
import { purchasePackage } from "@/server/actions/clientPackages";
import { isQuoteTransitionAllowed } from "@/schemas/quote";
import { PaymentSourceSchema } from "@/schemas/payment";
import { formatEUR } from "@/lib/utils/money";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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

// ── Tipo per assegnazione pacchetto al cliente ──────────────────────
type PackageAssignment = {
  packageId: string;
  packageNameSnapshot: string;
  totalAnalyses: number;
  priceCents: string; // stringa Euro (es. "100,00") per zEurInput
};

// ── Schema locale per il form pagamento (senza transform, compatibile zodResolver) ──
const ApprovePaymentFormSchema = z.object({
  clientId: z.string().min(1),
  source: PaymentSourceSchema,
  description: z.string().min(1, "Descrizione obbligatoria").max(500),
  totalAmountCents: z.string().min(1, "Importo obbligatorio"),
  installmentsCount: z.number().int().min(1).max(60),
  firstDueDate: z.string().min(1, "Data prima scadenza obbligatoria"),
  installmentPeriod: z.enum(["monthly", "biweekly", "custom"]),
  customInterval: z.number().int().min(1).optional(),
  customUnit: z.enum(["days", "months", "years"]).optional(),
  accontoCents: z.string().optional(),
  accontoDate: z.string().optional(),
  notes: z.string().max(1000).optional(),
}).superRefine((data, ctx) => {
  if (data.accontoDate && data.firstDueDate && data.accontoDate >= data.firstDueDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La data acconto deve essere precedente alla prima scadenza",
      path: ["accontoDate"],
    });
  }
});
type ApprovePaymentFormInput = z.infer<typeof ApprovePaymentFormSchema>;

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
  packages: PackageDoc[];
  defaultEnpaiaApplied?: boolean;
  defaultEnpaiaPercent?: number;
}

const _defaultFirstDueDate = new Date(Date.now() + 30 * 86_400_000)
  .toISOString()
  .slice(0, 10);

export function QuoteDetailClient({ quote, clients, analyses, packages, defaultEnpaiaApplied, defaultEnpaiaPercent }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmTransition, setConfirmTransition] = useState<QuoteStatus | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isSending, startSend] = useTransition();
  const [isWhatsApp, setIsWhatsApp] = useState(false);

  function handleApprove(
    withPayment: boolean,
    paymentData?: ApprovePaymentFormInput,
    packageAssignments?: PackageAssignment[],
  ) {
    startTransition(async () => {
      const transitionResult = await transitionQuote(quote.id, "approved", quote.version);
      if (!transitionResult.success) {
        toast.error(transitionResult.error);
        return;
      }

      // Assegna pacchetti al cliente
      for (const pkg of packageAssignments ?? []) {
        const pkgResult = await purchasePackage({
          clientId: quote.clientId,
          packageId: pkg.packageId,
          packageNameSnapshot: pkg.packageNameSnapshot,
          totalAnalyses: pkg.totalAnalyses,
          priceCents: pkg.priceCents,
          createPayment: false,
        });
        if (!pkgResult.success) {
          toast.error(`Errore assegnazione "${pkg.packageNameSnapshot}": ${pkgResult.error}`);
        }
      }

      if (withPayment && paymentData) {
        const paymentResult = await createManualPayment(paymentData);
        if (paymentResult.success) {
          toast.success("Preventivo approvato e pagamento creato");
        } else {
          toast.success("Preventivo approvato");
          toast.error(`Errore creazione pagamento: ${paymentResult.error}`);
        }
      } else {
        toast.success("Preventivo approvato");
      }

      setApproveOpen(false);
      router.refresh();
    });
  }

  function openEmail() {
    setEmailTo(quote.clientSnapshot.email ?? "");
    setEmailSubject(`Preventivo ${quote.number} — ${quote.clientSnapshot.displayName}`);
    setEmailBody(`Gentile cliente,\n\nin allegato il preventivo ${quote.number}.\n\nCordiali saluti`);
    setEmailOpen(true);
  }

  function handleWhatsApp() {
    const clientSlug = quote.clientSnapshot.displayName.replace(/\s+/g, '_').replace(/[/\\:*?"<>|]/g, '');
    const filename = `preventivo-${quote.number.replace("/", "-")}_${clientSlug}.pdf`;
    setIsWhatsApp(true);
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
    startSend(async () => {
      const result = await sendQuoteByEmail(quote.id, {
        to: emailTo,
        subject: emailSubject,
        body: emailBody,
      });
      if (result.success) {
        toast.success("Preventivo inviato via email");
        setEmailOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

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

  function handleRevision() {
    startTransition(async () => {
      const result = await createQuoteRevision(quote.id);
      if (result.success) {
        toast.success("Nuova revisione creata");
        router.push(`/quotes/${result.data.id}`);
      } else {
        toast.error(result.error);
      }
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
                {(quote.revision ?? 1) > 1 && (
                  <span className="text-base font-normal text-muted-foreground ml-2">
                    Rev. {quote.revision}
                  </span>
                )}
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
            {/* Invia via email */}
            <Button variant="outline" size="sm" onClick={openEmail}>
              <Mail className="size-3.5" strokeWidth={1.75} />
              Email
            </Button>

            {/* WhatsApp */}
            <Button variant="outline" size="sm" onClick={handleWhatsApp} disabled={isWhatsApp}>
              {isWhatsApp ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <WhatsAppIcon className="size-3.5" />
              )}
              WhatsApp
            </Button>

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
                    packages={packages}
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
                  } else if (btn.to === "approved") {
                    setApproveOpen(true);
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

            {(quote.status === "pending_approval" || quote.status === "rejected") && (
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={handleRevision}
              >
                {isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CopyPlus className="size-3.5" strokeWidth={1.75} />
                )}
                Nuova revisione
              </Button>
            )}
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
                  : `−${formatEUR(d.value)}`}
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

      {/* Dialog invio email */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
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
            <Button variant="outline" onClick={() => setEmailOpen(false)}>
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

      {/* Dialog approvazione preventivo con opzione pagamento */}
      <ApproveQuoteDialog
        open={approveOpen}
        onOpenChange={(v) => { if (!isPending) setApproveOpen(v); }}
        quote={quote}
        packages={packages}
        isPending={isPending}
        onConfirm={handleApprove}
      />
    </div>
  );
}

// ── Dialog approvazione con creazione pagamento opzionale ──────────────
function ApproveQuoteDialog({
  open,
  onOpenChange,
  quote,
  packages,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  quote: QuoteDoc;
  packages: PackageDoc[];
  isPending: boolean;
  onConfirm: (withPayment: boolean, data?: ApprovePaymentFormInput, packageAssignments?: PackageAssignment[]) => void;
}) {
  const [withPayment, setWithPayment] = useState(true);

  // Indici degli item-pacchetto esclusi dall'assegnazione (default: tutti inclusi)
  const [excludedIndices, setExcludedIndices] = useState<Set<number>>(new Set());

  // Items di tipo pacchetto presenti nel preventivo
  const packageItems = quote.items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => item.kind === "package") as Array<{
      item: Extract<typeof quote.items[number], { kind: "package" }>;
      idx: number;
    }>;

  function toggleExclude(idx: number) {
    setExcludedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const defaultFirstDueDate = _defaultFirstDueDate;

  const form = useForm<ApprovePaymentFormInput>({
    resolver: zodResolver(ApprovePaymentFormSchema),
    defaultValues: {
      clientId: quote.clientId,
      source: { kind: "manual", refId: quote.id },
      description: `Preventivo ${quote.number} — ${quote.clientSnapshot.displayName}`,
      totalAmountCents: (quote.totalCents / 100).toFixed(2).replace(".", ","),
      installmentsCount: quote.paymentTerms?.installmentsCount ?? 1,
      firstDueDate: quote.paymentTerms?.firstDueDate && quote.paymentTerms.firstDueDate !== ""
        ? quote.paymentTerms.firstDueDate
        : defaultFirstDueDate,
      installmentPeriod: quote.paymentTerms?.installmentPeriod ?? "monthly",
      customInterval: quote.paymentTerms?.customInterval,
      customUnit: quote.paymentTerms?.customUnit,
      accontoCents: quote.paymentTerms?.accontoCents
        ? (quote.paymentTerms.accontoCents / 100).toFixed(2).replace(".", ",")
        : "",
      accontoDate: "",
      notes: "",
    },
  });

  const count = useWatch({ control: form.control, name: "installmentsCount" });
  const installmentPeriod = useWatch({ control: form.control, name: "installmentPeriod" });
  const priceInput = useWatch({ control: form.control, name: "totalAmountCents" });
  const accontoInput = useWatch({ control: form.control, name: "accontoCents" });
  const accontoDate = useWatch({ control: form.control, name: "accontoDate" });
  const parsedCents = (() => {
    const raw = String(priceInput ?? "").replace(",", ".");
    const n = parseFloat(raw);
    return isNaN(n) ? 0 : Math.round(n * 100);
  })();
  const parsedAccontoCents = (() => {
    const raw = String(accontoInput ?? "").replace(",", ".");
    const n = parseFloat(raw);
    return isNaN(n) ? 0 : Math.round(n * 100);
  })();
  const hasAcconto = parsedAccontoCents > 0 && (count ?? 1) > 1;
  const residuoCents = hasAcconto ? Math.max(0, parsedCents - parsedAccontoCents) : parsedCents;

  function handleSubmit() {
    // Raccogli assegnazioni pacchetti (non esclusi)
    const packageAssignments: PackageAssignment[] = packageItems
      .filter(({ idx }) => !excludedIndices.has(idx))
      .map(({ item }) => {
        const template = packages.find((p) => p.id === item.packageId);
        return {
          packageId: item.packageId,
          packageNameSnapshot: item.nameSnapshot,
          totalAnalyses: template?.totalAnalyses ?? 1,
          priceCents: ((item.unitPriceCents * item.quantity) / 100)
            .toFixed(2)
            .replace(".", ","),
        };
      });

    if (withPayment) {
      form.handleSubmit((data) => onConfirm(true, data, packageAssignments))();
    } else {
      onConfirm(false, undefined, packageAssignments);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Approva preventivo {quote.number}</DialogTitle>
          <DialogDescription>
            Il preventivo sarà approvato e bloccato. Vuoi generare anche un pagamento?
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto space-y-4 py-2 pr-1">
          {/* ── Sezione pacchetti da assegnare ── */}
          {packageItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pacchetti da assegnare al cliente
              </p>
              <div className="rounded-lg border border-border divide-y divide-border">
                {packageItems.map(({ item, idx }) => {
                  const excluded = excludedIndices.has(idx);
                  const totalCents = item.unitPriceCents * item.quantity;
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-3 p-3 transition-opacity ${
                        excluded ? "opacity-40" : ""
                      }`}
                    >
                      <Package
                        className="size-4 text-muted-foreground shrink-0"
                        strokeWidth={1.75}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.nameSnapshot}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity} × {formatEUR(item.unitPriceCents)} ={" "}
                          <span className="font-medium tabular-nums">
                            {formatEUR(totalCents)}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {excluded && (
                          <span className="text-xs text-muted-foreground">Non inserire</span>
                        )}
                        <Switch
                          checked={!excluded}
                          onCheckedChange={() => toggleExclude(idx)}
                          aria-label={excluded ? "Includi pacchetto" : "Escludi pacchetto"}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {packageItems.length > 0 && <Separator />}

          {/* Toggle crea pagamento */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Genera pagamento</p>
              <p className="text-xs text-muted-foreground">
                Crea automaticamente un pagamento da {formatEUR(quote.totalCents)}
              </p>
            </div>
            <Switch
              checked={withPayment}
              onCheckedChange={setWithPayment}
            />
          </div>

          {/* Form pagamento (visibile solo se withPayment) */}
          {withPayment && (
            <Form {...form}>
              <div className="space-y-3">
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descrizione *</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="totalAmountCents"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Importo totale (€) *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                            €
                          </span>
                          <Input
                            className="pl-7"
                            placeholder="0,00"
                            {...field}
                            value={String(field.value ?? "")}
                          />
                        </div>
                      </FormControl>
                      {parsedCents > 0 && (
                        <FormDescription>{formatEUR(parsedCents)}</FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="installmentsCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rate *</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            inputMode="numeric"
                            {...field}
                            value={field.value != null ? String(field.value) : ""}
                            onChange={(e) => {
                              const n = parseInt(e.target.value, 10);
                              field.onChange(isNaN(n) ? undefined : n);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="firstDueDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prima scadenza *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value ?? ""} min={accontoDate || undefined} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {(count ?? 1) > 1 && (
                  <FormField
                    control={form.control}
                    name="installmentPeriod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cadenza</FormLabel>
                        <FormControl>
                          <select
                            className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                            {...field}
                            value={field.value ?? "monthly"}
                          >
                            <option value="monthly">Mensile</option>
                            <option value="biweekly">Bisettimanale</option>
                            <option value="custom">Personalizzato</option>
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {(count ?? 1) > 1 && installmentPeriod === "custom" && (
                  <div className="flex gap-2">
                    <FormField
                      control={form.control}
                      name="customInterval"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel>Ogni</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.valueAsNumber)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="customUnit"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel>Unità</FormLabel>
                          <FormControl>
                            <select
                              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                              {...field}
                              value={field.value ?? "months"}
                            >
                              <option value="days">Giorni</option>
                              <option value="months">Mesi</option>
                              <option value="years">Anni</option>
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {(count ?? 1) > 1 && (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="accontoCents"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Acconto già incassato (€)</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                                €
                              </span>
                              <Input
                                className="pl-7"
                                placeholder="0,00"
                                {...field}
                                value={String(field.value ?? "")}
                              />
                            </div>
                          </FormControl>
                          <FormDescription>
                            Importo già pagato — rata 0 saldata
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {hasAcconto && (
                      <FormField
                        control={form.control}
                        name="accontoDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Data acconto</FormLabel>
                            <FormControl>
                              <Input
                                type="date"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                )}

                {parsedCents > 0 && (count ?? 1) > 1 && (
                  <p className="text-xs text-muted-foreground">
                    {hasAcconto
                      ? `Residuo ${formatEUR(residuoCents)} su ${count ?? 1} rate da ~${formatEUR(Math.round(residuoCents / (count ?? 1)))} cad.`
                      : `Circa ${formatEUR(Math.round(parsedCents / (count ?? 1)))} per rata`}
                  </p>
                )}
              </div>
            </Form>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Annulla
          </Button>
          <Button disabled={isPending} onClick={handleSubmit}>
            {isPending && <Loader2 className="size-3.5 animate-spin" />}
            {withPayment ? "Approva e crea pagamento" : "Approva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
