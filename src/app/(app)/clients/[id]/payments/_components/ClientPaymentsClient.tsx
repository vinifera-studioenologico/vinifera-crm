"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  CreditCard,
  Plus,
  Loader2,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import type { PaymentDoc, InstallmentDoc, PaymentStatus } from "@/schemas/payment";
import type { ClientDoc } from "@/schemas/client";

const METHOD_LABELS: Record<string, string> = {
  cash: "Contanti",
  bank_transfer: "Bonifico",
  card: "Carta",
  other: "Altro",
};
import {
  getPaymentInstallments,
  cancelPayment,
  createManualPayment,
} from "@/server/actions/payments";
import { formatEUR } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";

import { MarkInstallmentPaidForm } from "@/components/forms/MarkInstallmentPaidForm";
import { Button } from "@/components/ui/button";
import { CsvExportButton } from "@/components/data-table/CsvExportButton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PaymentSourceSchema } from "@/schemas/payment";

// Schema client costruito da zero (senza zEurInput transform)
// zodResolver richiede che input e output coincidano
const ManualPaymentFormSchema = z.object({
  clientId: z.string().min(1, "Cliente obbligatorio"),
  source: PaymentSourceSchema,
  description: z.string().min(1, "Descrizione obbligatoria").max(500),
  totalAmountCents: z.string().min(1, "Importo obbligatorio"),
  installmentsCount: z.number().int().min(1).max(60),
  firstDueDate: z.string().min(1, "Data prima scadenza obbligatoria"),
  installmentPeriod: z.enum(["monthly", "biweekly", "custom"]),
  notes: z.string().max(1000).optional(),
});
type ManualPaymentInput = z.infer<typeof ManualPaymentFormSchema>;

// ── Colori stato pagamento ────────────────────────────────────────────
const PAYMENT_STATUS_CONFIG: Record<
  PaymentStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "In attesa",
    className:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
  },
  partial: {
    label: "Parziale",
    className:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400",
  },
  paid: {
    label: "Pagato",
    className:
      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  overdue: {
    label: "Scaduto",
    className:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400",
  },
  cancelled: {
    label: "Annullato",
    className: "bg-muted text-muted-foreground border-border",
  },
};

function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const cfg = PAYMENT_STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={cfg.className}>
      {cfg.label}
    </Badge>
  );
}

// ── Form pagamento manuale ────────────────────────────────────────────

function ManualPaymentForm({
  clientId,
  onSuccess,
}: {
  clientId: string;
  onSuccess: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<ManualPaymentInput>({
    resolver: zodResolver(ManualPaymentFormSchema),
    defaultValues: {
      clientId,
      source: { kind: "manual" },
      description: "",
      totalAmountCents: "",
      installmentsCount: 1,
      // eslint-disable-next-line react-hooks/purity
      firstDueDate: new Date(Date.now() + 30 * 86400 * 1000)
        .toISOString()
        .slice(0, 10),
      installmentPeriod: "monthly",
      notes: "",
    },
    mode: "onTouched",
  });

  const count = useWatch({ control: form.control, name: "installmentsCount" });
  const priceInput = useWatch({ control: form.control, name: "totalAmountCents" });
  const parsedCents = (() => {
    const raw = String(priceInput ?? "").replace(",", ".");
    const n = parseFloat(raw);
    return isNaN(n) ? 0 : Math.round(n * 100);
  })();

  function onSubmit() {
    const raw = form.getValues();
    startTransition(async () => {
      const result = await createManualPayment(raw);
      if (result.success) {
        toast.success("Pagamento creato");
        onSuccess();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrizione *</FormLabel>
              <FormControl>
                <Input placeholder="Es. Acconto analisi Maggio 2026" {...field} />
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
                    type="number"
                    min={1}
                    max={60}
                    {...field}
                    value={String(field.value ?? 1)}
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value, 10) || 1)
                    }
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
                  <Input type="date" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {(count ?? 1) > 1 && (
          <>
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
            {parsedCents > 0 && (
              <p className="text-xs text-muted-foreground">
                Circa {formatEUR(Math.round(parsedCents / (count ?? 1)))} per rata
              </p>
            )}
          </>
        )}

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending && <Loader2 className="size-3.5 animate-spin" />}
          {isPending ? "Creazione..." : "Crea pagamento"}
        </Button>
      </form>
    </Form>
  );
}

// ── Riga rata ─────────────────────────────────────────────────────────
function InstallmentRow({
  installment,
  paymentId,
  onPaid,
}: {
  installment: InstallmentDoc;
  paymentId: string;
  onPaid: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const isPending =
    installment.status === "pending" || installment.status === "overdue";

  const dueDateTs = installment.dueDate;

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm">
            <span className="font-medium tabular-nums">
              {formatEUR(installment.amountCents)}
            </span>
            {dueDateTs != null && (
              <span className="text-muted-foreground ml-2 text-xs">
                scade{" "}
                {formatDate(
                  dueDateTs as Parameters<typeof formatDate>[0],
                )}
              </span>
            )}
          </p>
          {installment.status === "paid" && installment.paidAt != null && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
              Pagato il{" "}
              {formatDate(
                installment.paidAt as Parameters<typeof formatDate>[0],
              )}{" "}
              · {installment.method ? (METHOD_LABELS[installment.method] ?? installment.method) : ""}
              {installment.note && ` · ${installment.note}`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              installment.status === "paid" &&
                "text-emerald-700 border-emerald-300 dark:text-emerald-400",
              installment.status === "overdue" &&
                "text-red-700 border-red-300 dark:text-red-400",
              (installment.status === "pending") &&
                "text-amber-700 border-amber-300 dark:text-amber-400",
            )}
          >
            {installment.status === "paid"
              ? "Pagato"
              : installment.status === "overdue"
                ? "Scaduto"
                : installment.status === "cancelled"
                  ? "Annullato"
                  : "In attesa"}
          </Badge>

          {isPending && !showForm && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs px-2"
              onClick={() => setShowForm(true)}
            >
              Registra
            </Button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <MarkInstallmentPaidForm
            paymentId={paymentId}
            installment={installment}
            onSuccess={() => {
              setShowForm(false);
              onPaid();
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}
    </div>
  );
}

// ── Card pagamento espandibile ────────────────────────────────────────
function PaymentCard({
  payment,
  onCancelRequest,
  onInstallmentPaid,
}: {
  payment: PaymentDoc;
  onCancelRequest: (p: PaymentDoc) => void;
  onInstallmentPaid: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [installments, setInstallments] = useState<InstallmentDoc[] | null>(null);
  const [loading, startLoading] = useTransition();

  function handleExpand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!installments) {
      startLoading(async () => {
        const data = await getPaymentInstallments(payment.id);
        setInstallments(data);
      });
    }
  }

  const progressPct =
    payment.totalAmountCents > 0
      ? Math.round((payment.paidAmountCents / payment.totalAmountCents) * 100)
      : 0;

  const sourceLabel: Record<string, string> = {
    sample: "Campione",
    package: "Pacchetto",
    manual: "Manuale",
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
        onClick={handleExpand}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium truncate">{payment.description}</p>
            <PaymentStatusBadge status={payment.status} />
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {payment.source.sampleCode
                ? `Campione · ${payment.source.sampleCode}`
                : (sourceLabel[payment.source.kind] ?? payment.source.kind)}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-xs text-muted-foreground">
              {payment.installmentsCount > 1
                ? `${payment.installmentsCount} rate`
                : "Pagamento unico"}{" "}
              · Totale {formatEUR(payment.totalAmountCents)}
            </p>
            {payment.paidAmountCents > 0 && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Incassato {formatEUR(payment.paidAmountCents)}
              </p>
            )}
          </div>

          {/* Barra progresso */}
          {payment.totalAmountCents > 0 && (
            <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  payment.status === "paid"
                    ? "bg-emerald-500"
                    : payment.status === "cancelled"
                      ? "bg-muted-foreground"
                      : "bg-primary",
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </div>

        {loading ? (
          <Loader2 className="size-4 text-muted-foreground shrink-0 animate-spin" />
        ) : expanded ? (
          <ChevronDown className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
        )}
      </button>

      {/* Rate espanse */}
      {expanded && (
        <>
          <Separator />
          {installments === null ? (
            <div className="px-4 py-3 flex justify-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {installments.map((inst) => (
                <InstallmentRow
                  key={inst.id}
                  installment={inst}
                  paymentId={payment.id}
                  onPaid={() => {
                    // Refresh installments list
                    startLoading(async () => {
                      const data = await getPaymentInstallments(payment.id);
                      setInstallments(data);
                    });
                    onInstallmentPaid();
                  }}
                />
              ))}
            </div>
          )}

          {/* Azioni pagamento */}
          {payment.status !== "paid" && payment.status !== "cancelled" && (
            <>
              <Separator />
              <div className="px-4 py-2 flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => onCancelRequest(payment)}
                >
                  <Ban className="size-3.5 mr-1" strokeWidth={1.75} />
                  Annulla pagamento
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Componente principale ─────────────────────────────────────────────
interface Props {
  client: ClientDoc;
  initialPayments: PaymentDoc[];
}

export function ClientPaymentsClient({ client, initialPayments }: Props) {
  const router = useRouter();
  const [cancelTarget, setCancelTarget] = useState<PaymentDoc | null>(null);
  const [isPending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);

  // KPI
  const pending = initialPayments.filter(
    (p) => p.status === "pending" || p.status === "partial",
  );
  const totalPending = pending.reduce((s, p) => s + p.totalAmountCents - p.paidAmountCents, 0);
  const totalRevenue = initialPayments.reduce((s, p) => s + p.paidAmountCents, 0);

  function handleCancel() {
    if (!cancelTarget) return;
    startTransition(async () => {
      const result = await cancelPayment(cancelTarget.id);
      if (result.success) {
        toast.success("Pagamento annullato");
        setCancelTarget(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Da incassare</p>
          <p className="text-xl font-semibold tabular-nums mt-1 text-amber-600 dark:text-amber-400">
            {formatEUR(totalPending)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Incassato tot.</p>
          <p className="text-xl font-semibold tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">
            {formatEUR(totalRevenue)}
          </p>
        </div>
      </div>

      {/* Header + nuovo pagamento */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Pagamenti ({initialPayments.length})
        </h2>
        <div className="flex items-center gap-2">
          <CsvExportButton
            data={initialPayments}
            columns={[
              { header: "Descrizione", accessor: (p: PaymentDoc) => p.description },
              { header: "Stato", accessor: (p: PaymentDoc) => PAYMENT_STATUS_CONFIG[p.status].label },
              { header: "Importo totale (\u20ac)", accessor: (p: PaymentDoc) => (p.totalAmountCents / 100).toFixed(2).replace(".", ",") },
              { header: "Incassato (\u20ac)", accessor: (p: PaymentDoc) => (p.paidAmountCents / 100).toFixed(2).replace(".", ",") },
              { header: "Residuo (\u20ac)", accessor: (p: PaymentDoc) => ((p.totalAmountCents - p.paidAmountCents) / 100).toFixed(2).replace(".", ",") },
              { header: "N. rate", accessor: (p: PaymentDoc) => String(p.installmentsCount) },
              { header: "Creato il", accessor: (p: PaymentDoc) => p.createdAt ? formatDate(p.createdAt as Parameters<typeof formatDate>[0]) : "" },
            ]}
            filenamePrefix="pagamenti_cliente"
          />
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger
              render={
                <Button size="sm">
                  <Plus className="size-3.5" strokeWidth={1.75} />
                  Nuovo pagamento
                </Button>
              }
            />
            <SheetContent side="right" className="overflow-y-auto">
              <SheetHeader className="mb-6">
                <SheetTitle>Pagamento manuale — {client.displayName}</SheetTitle>
              </SheetHeader>
              <ManualPaymentForm
                clientId={client.id}
                onSuccess={() => {
                  setSheetOpen(false);
                  router.refresh();
                }}
              />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Lista pagamenti */}
      {initialPayments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 flex flex-col items-center gap-3 text-center">
          <CreditCard className="size-6 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            Nessun pagamento registrato per questo cliente.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {initialPayments.map((p) => (
            <PaymentCard
              key={p.id}
              payment={p}
              onCancelRequest={setCancelTarget}
              onInstallmentPaid={() => router.refresh()}
            />
          ))}
        </div>
      )}

      {/* Dialog conferma annullamento */}
      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annulla pagamento</DialogTitle>
            <DialogDescription>
              Il pagamento &quot;{cancelTarget?.description}&quot; sarà annullato insieme
              a tutte le rate pendenti.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Torna indietro
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={handleCancel}
            >
              {isPending && <Loader2 className="size-3.5 animate-spin" />}
              Annulla pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
