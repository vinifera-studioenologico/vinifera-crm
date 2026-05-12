import type { SampleStatus } from "@/schemas/sample";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<SampleStatus, { label: string; className: string }> = {
  pending: {
    label: "In attesa",
    className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  },
  in_progress: {
    label: "In lavorazione",
    className: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
  },
  completed: {
    label: "Completato",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  },
  cancelled: {
    label: "Annullato",
    className: "bg-muted text-muted-foreground border-border",
  },
};

interface Props {
  status: SampleStatus;
  className?: string;
}

export function SampleStatusBadge({ status, className }: Props) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
