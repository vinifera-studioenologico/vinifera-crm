"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { it as itLocale } from "date-fns/locale";
import { Copy } from "lucide-react";

import type { EventOrderSummary } from "@/server/actions/eventOrders";
import { refundOrder, cancelFreeOrder } from "@/server/actions/eventOrders";
import { formatEUR } from "@/lib/utils/money";
import { cn } from "@/lib/utils";

import { DataTable } from "@/components/data-table/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending_payment: { label: "In attesa", className: "bg-muted text-muted-foreground" },
  paid:            { label: "Pagato", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  expired:         { label: "Scaduto", className: "bg-transparent border border-border text-muted-foreground" },
  refunded:        { label: "Rimborsato", className: "bg-destructive/10 text-destructive" },
  cancelled:       { label: "Annullato", className: "bg-destructive/10 text-destructive" },
  failed:          { label: "Fallito", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
};

interface Props {
  orders: EventOrderSummary[];
  loading?: boolean;
}

export function OrdersTable({ orders, loading = false }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<EventOrderSummary | null>(null);
  const [, startTransition] = useTransition();

  function handleRefund(order: EventOrderSummary) {
    startTransition(async () => {
      const result = await refundOrder(order.id);
      if (result.success) {
        toast.success("Rimborso Stripe avviato. Lo stato si aggiornerà via webhook.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setSelected(null);
    });
  }

  function handleCancelFree(order: EventOrderSummary) {
    startTransition(async () => {
      const result = await cancelFreeOrder(order.id);
      if (result.success) {
        toast.success("Prenotazione annullata");
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setSelected(null);
    });
  }

  function copyBillingData(order: EventOrderSummary) {
    const b = order.billing as Record<string, unknown> | null;
    if (!b) return;

    let text = "";
    if (b["type"] === "private") {
      text = [
        `Tipo: Privato`,
        `Nome: ${b["firstName"]} ${b["lastName"]}`,
        `CF: ${b["taxCode"]}`,
        `Indirizzo: ${(b["address"] as Record<string, string>)?.street}, ${(b["address"] as Record<string, string>)?.zip} ${(b["address"] as Record<string, string>)?.city} (${(b["address"] as Record<string, string>)?.province})`,
      ].join("\n");
    } else {
      text = [
        `Tipo: Azienda`,
        `Ragione sociale: ${b["businessName"]}`,
        `P.IVA: ${b["vatNumber"]}`,
        b["sdiCode"] ? `SDI: ${b["sdiCode"]}` : null,
        b["pec"] ? `PEC: ${b["pec"]}` : null,
        `Indirizzo: ${(b["address"] as Record<string, string>)?.street}, ${(b["address"] as Record<string, string>)?.zip} ${(b["address"] as Record<string, string>)?.city} (${(b["address"] as Record<string, string>)?.province})`,
      ].filter(Boolean).join("\n");
    }

    navigator.clipboard.writeText(text).then(() => toast.success("Dati fatturazione copiati")).catch(() => toast.error("Errore copia"));
  }

  const columns: ColumnDef<EventOrderSummary>[] = [
    {
      accessorKey: "orderNumber",
      header: "N° ordine",
      size: 110,
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.orderNumber}</span>
      ),
    },
    {
      id: "buyer",
      header: "Acquirente",
      cell: ({ row }) => {
        const b = row.original.buyer;
        return (
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{b.firstName} {b.lastName}</p>
            <p className="text-xs text-muted-foreground truncate">{b.email}</p>
          </div>
        );
      },
    },
    {
      accessorKey: "seats",
      header: "Posti",
      size: 60,
      cell: ({ row }) => <span className="tabular-nums">{row.original.seats}</span>,
    },
    {
      accessorKey: "totalCents",
      header: "Totale",
      size: 100,
      cell: ({ row }) => {
        const v = row.original.totalCents;
        return v === 0
          ? <span className="text-green-700 dark:text-green-400 font-medium text-sm">Gratuito</span>
          : <span className="tabular-nums text-sm">{formatEUR(v)}</span>;
      },
    },
    {
      accessorKey: "status",
      header: "Stato",
      size: 110,
      cell: ({ row }) => {
        const cfg = STATUS_BADGE[row.original.status] ?? STATUS_BADGE["expired"]!;
        return <Badge variant="outline" className={cn("border-0 text-xs", cfg.className)}>{cfg.label}</Badge>;
      },
    },
    {
      accessorKey: "createdAt",
      header: "Data",
      size: 120,
      cell: ({ row }) => {
        const ts = row.original.createdAt;
        if (!ts) return "—";
        try {
          return <span className="text-xs tabular-nums">{format(new Date(ts), "dd/MM/yy HH:mm", { locale: itLocale })}</span>;
        } catch { return "—"; }
      },
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={orders}
        loading={loading}
        initialSorting={[{ id: "createdAt", desc: true }]}
        emptyMessage="Nessun ordine per questo evento."
        onRowClick={(row) => setSelected(row)}
      />

      {/* Drawer dettaglio */}
      <Sheet open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Ordine {selected?.orderNumber}</SheetTitle>
          </SheetHeader>

          {selected !== null && <OrderDetail order={selected} onRefund={handleRefund} onCancelFree={handleCancelFree} onCopyBilling={copyBillingData} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function OrderDetail({
  order,
  onRefund,
  onCancelFree,
  onCopyBilling,
}: {
  order: EventOrderSummary;
  onRefund: (o: EventOrderSummary) => void;
  onCancelFree: (o: EventOrderSummary) => void;
  onCopyBilling: (o: EventOrderSummary) => void;
}) {
  return (
    <div className="mt-6 space-y-5 text-sm">
      <section>
        <h3 className="font-semibold text-muted-foreground uppercase tracking-wide text-xs mb-2">Acquirente</h3>
        <p>{order.buyer.firstName} {order.buyer.lastName}</p>
        <p className="text-muted-foreground">{order.buyer.email}</p>
        <p className="text-muted-foreground">{order.buyer.phone}</p>
      </section>

      {order.participants.length > 0 && (
        <section>
          <h3 className="font-semibold text-muted-foreground uppercase tracking-wide text-xs mb-2">Partecipanti</h3>
          <ol className="space-y-0.5">
            {order.participants.map((p, i) => (
              <li key={i} className="text-sm">{`${i + 1}. ${p.firstName} ${p.lastName}`}</li>
            ))}
          </ol>
        </section>
      )}

      {order.billing !== null && order.billing !== undefined && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-muted-foreground uppercase tracking-wide text-xs">Fatturazione</h3>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onCopyBilling(order)}>
              <Copy className="size-3" strokeWidth={1.75} /> Copia
            </Button>
          </div>
          <BillingDetails billing={order.billing as Record<string, unknown>} />
        </section>
      )}

      {order.paymentIntentId && (
        <section>
          <h3 className="font-semibold text-muted-foreground uppercase tracking-wide text-xs mb-2">Stripe</h3>
          <a
            href={`https://dashboard.stripe.com/test/payment_intents/${order.paymentIntentId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline font-mono break-all"
          >
            {order.paymentIntentId}
          </a>
        </section>
      )}

      {order.status === "paid" && (
        <div className="pt-3 border-t border-border">
          {order.paymentIntentId ? (
            <Button variant="destructive" size="sm" onClick={() => onRefund(order)}>
              Rimborsa ordine
            </Button>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => onCancelFree(order)}>
              Annulla prenotazione
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function BillingDetails({ billing }: { billing: Record<string, unknown> }) {
  if (billing["type"] === "private") {
    const addr = billing["address"] as Record<string, string> | undefined;
    return (
      <dl className="space-y-1">
        <dt className="text-muted-foreground text-xs">Nome</dt>
        <dd>{String(billing["firstName"])} {String(billing["lastName"])}</dd>
        <dt className="text-muted-foreground text-xs">CF</dt>
        <dd className="font-mono">{String(billing["taxCode"])}</dd>
        {addr && (
          <>
            <dt className="text-muted-foreground text-xs">Indirizzo</dt>
            <dd>{addr["street"]}, {addr["zip"]} {addr["city"]} ({addr["province"]})</dd>
          </>
        )}
      </dl>
    );
  }
  const addr = billing["address"] as Record<string, string> | undefined;
  return (
    <dl className="space-y-1">
      <dt className="text-muted-foreground text-xs">Ragione sociale</dt>
      <dd>{String(billing["businessName"])}</dd>
      <dt className="text-muted-foreground text-xs">P.IVA</dt>
      <dd className="font-mono">{String(billing["vatNumber"])}</dd>
      {!!billing["sdiCode"] && <><dt className="text-muted-foreground text-xs">SDI</dt><dd className="font-mono">{String(billing["sdiCode"])}</dd></>}
      {!!billing["pec"] && <><dt className="text-muted-foreground text-xs">PEC</dt><dd>{String(billing["pec"])}</dd></>}
      {addr && (
        <>
          <dt className="text-muted-foreground text-xs">Indirizzo</dt>
          <dd>{addr["street"]}, {addr["zip"]} {addr["city"]} ({addr["province"]})</dd>
        </>
      )}
    </dl>
  );
}
