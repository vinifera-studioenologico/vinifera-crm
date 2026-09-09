import type { PaymentStatus } from "@/schemas/payment";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<PaymentStatus, { label: string; className: string }> = {
  pending: {
    label: "In attesa",
    className:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  },
  partial: {
    label: "Parziale",
    className:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
  },
  paid: {
    label: "Pagato",
    className:
      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  },
  overdue: {
    label: "Scaduto",
    className:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  },
  cancelled: {
    label: "Annullato",
    className: "bg-muted text-muted-foreground border-border",
  },
};

const NONE_CONFIG = {
  label: "Nessun pagamento",
  className: "bg-muted text-muted-foreground border-border",
};

interface Props {
  /** `null`/`undefined` = nessun pagamento collegato al campione. */
  status: PaymentStatus | null | undefined;
  className?: string;
}

export function PaymentStatusBadge({ status, className }: Props) {
  const config = status ? STATUS_CONFIG[status] : NONE_CONFIG;
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}

/** Etichetta testuale (es. per export CSV), senza il badge visivo. */
export function paymentStatusLabel(status: PaymentStatus | null | undefined): string {
  return status ? STATUS_CONFIG[status].label : NONE_CONFIG.label;
}
