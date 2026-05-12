import type { QuoteStatus } from "@/schemas/quote";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<
  QuoteStatus,
  { label: string; className: string }
> = {
  draft: { label: "Bozza", className: "bg-muted text-muted-foreground border-border" },
  pending_approval: { label: "In approvazione", className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800" },
  approved: { label: "Approvato", className: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800" },
  rejected: { label: "Rifiutato", className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800" },
  cancelled: { label: "Annullato", className: "bg-muted text-muted-foreground border-border" },
};

interface Props {
  status: QuoteStatus;
  className?: string;
}

export function QuoteStatusBadge({ status, className }: Props) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge
      variant="outline"
      className={cn(config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
