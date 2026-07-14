import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PublicEventStatus } from "@/lib/events/status";
import type { EventStatus } from "@/schemas/event";

// ── Badge stato CRM (convenzione colori CRM) ──────────────────────────
// draft        → outline grigio
// upcoming     → grigio (pending)
// bookable     → blu (in_progress)
// sold_out     → ambra (overdue)
// past         → verde (completed)
// cancelled    → rosso scuro

type AnyEventStatus = EventStatus | PublicEventStatus | "overbooked";

const STATUS_CONFIG: Record<AnyEventStatus, { label: string; className: string }> = {
  draft:     { label: "Bozza",             className: "bg-transparent border border-border text-muted-foreground" },
  upcoming:  { label: "Prossimamente",     className: "bg-muted text-muted-foreground" },
  bookable:  { label: "Prenotabile",       className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  sold_out:  { label: "Esaurito",          className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  past:      { label: "Concluso",          className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  cancelled: { label: "Cancellato",        className: "bg-destructive/10 text-destructive" },
  published: { label: "Pubblicato",        className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  overbooked:{ label: "Overbooking ⚠",    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
};

interface Props {
  status: AnyEventStatus;
  className?: string;
}

export function EventStatusBadge({ status, className }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG["draft"];
  return (
    <Badge
      variant="outline"
      className={cn("border-0 text-xs font-medium", config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
