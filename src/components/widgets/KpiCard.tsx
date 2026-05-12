import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  icon: LucideIcon;
  value?: string;
  description?: string;
  trend?: { label: string; positive: boolean };
  loading?: boolean;
  className?: string;
}

export function KpiCard({
  title,
  icon: Icon,
  value,
  description,
  trend,
  loading = false,
  className,
}: KpiCardProps) {
  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-2 pt-5 px-5">
        <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
          {title}
          <Icon
            className="size-4 text-muted-foreground/60 shrink-0"
            strokeWidth={1.75}
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {loading ? (
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3.5 w-36" />
          </div>
        ) : (
          <>
            <p className="text-2xl font-semibold text-foreground tabular-nums">
              {value ?? "—"}
            </p>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {description}
              </p>
            )}
            {trend && (
              <p
                className={cn(
                  "text-xs font-medium mt-1",
                  trend.positive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-500 dark:text-red-400",
                )}
              >
                {trend.label}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
