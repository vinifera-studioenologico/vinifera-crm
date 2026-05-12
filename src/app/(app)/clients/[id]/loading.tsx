import { Skeleton } from "@/components/ui/skeleton";

export default function ClientDetailLoading() {
  return (
    <div className="space-y-0">
      {/* Header cliente */}
      <div className="border-b border-border px-4 py-5 md:px-6 space-y-3">
        <div className="flex items-start gap-4">
          <Skeleton className="size-12 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-52" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 pt-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-lg" />
          ))}
        </div>
      </div>
      {/* Contenuto */}
      <div className="p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-6 w-32" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3 items-center">
              <Skeleton className="size-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
