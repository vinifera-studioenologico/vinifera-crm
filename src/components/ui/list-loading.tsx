import { Skeleton } from "@/components/ui/skeleton";

// Skeleton generico per liste (clienti, analisi, pacchetti, campioni, preventivi, referti, pagamenti, promemoria)
function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
      <Skeleton className="size-8 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5 min-w-0">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full shrink-0" />
      <Skeleton className="size-4 rounded shrink-0" />
    </div>
  );
}

export default function ListLoading() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      {/* Search / filters */}
      <div className="flex gap-3">
        <Skeleton className="h-8 flex-1 max-w-sm rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <TableRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
