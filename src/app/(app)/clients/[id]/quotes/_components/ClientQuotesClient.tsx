"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ChevronRight, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { QuoteDoc } from "@/schemas/quote";
import type { ClientDoc } from "@/schemas/client";
import type { AnalysisDoc } from "@/schemas/analysis";
import type { PackageDoc } from "@/schemas/package";
import { deleteQuote } from "@/server/actions/quotes";
import { formatEUR } from "@/lib/utils/money";

import { QuoteForm } from "@/components/forms/QuoteForm";
import { QuoteStatusBadge } from "@/components/widgets/QuoteStatusBadge";
import { Button } from "@/components/ui/button";
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

interface Props {
  client: ClientDoc;
  initialQuotes: QuoteDoc[];
  analyses: AnalysisDoc[];
  packages: PackageDoc[];
  defaultEnpaiaApplied: boolean;
  defaultEnpaiaPercent: number;
}

export function ClientQuotesClient({
  client,
  initialQuotes,
  analyses,
  packages,
  defaultEnpaiaApplied,
  defaultEnpaiaPercent,
}: Props) {
  const router = useRouter();
  const [quotes, setQuotes] = useState(initialQuotes);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState<QuoteDoc | null>(null);
  const [, startTransition] = useTransition();

  function handleDelete(quote: QuoteDoc) {
    startTransition(async () => {
      const result = await deleteQuote(quote.id);
      if (result.success) {
        toast.success("Bozza eliminata");
        setQuotes((prev) => prev.filter((q) => q.id !== quote.id));
      } else {
        toast.error(result.error);
      }
      setDeleting(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Preventivi ({quotes.length})
        </h2>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            render={
              <Button size="sm">
                <Plus className="size-3.5" strokeWidth={1.75} />
                Nuovo preventivo
              </Button>
            }
          />
          <SheetContent side="right" className="overflow-y-auto">
            <SheetHeader className="mb-6">
              <SheetTitle>Nuovo preventivo — {client.displayName}</SheetTitle>
            </SheetHeader>
            <QuoteForm
              clients={[client]}
              analyses={analyses}
              packages={packages}
              defaultClientId={client.id}
              defaultEnpaiaApplied={defaultEnpaiaApplied}
              defaultEnpaiaPercent={defaultEnpaiaPercent}
              onSuccess={(id) => {
                setSheetOpen(false);
                router.push(`/quotes/${id}`);
              }}
            />
          </SheetContent>
        </Sheet>
      </div>

      {quotes.length === 0 ? (
        <div className="rounded-xl border border-border border-dashed p-12 flex flex-col items-center gap-3 text-center">
          <FileText className="size-6 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            Nessun preventivo per questo cliente.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
          {quotes.map((q) => (
            <div
              key={q.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              <button
                className="flex-1 min-w-0 text-left"
                onClick={() => router.push(`/quotes/${q.id}`)}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {q.number}
                  </span>
                  <QuoteStatusBadge status={q.status} />
                </div>
                {q.notes && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {q.notes}
                  </p>
                )}
              </button>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-medium tabular-nums">
                  {formatEUR(q.totalCents)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push(`/quotes/${q.id}`)}
                  aria-label="Apri preventivo"
                >
                  <ChevronRight className="size-4" strokeWidth={1.75} />
                </Button>
                {q.status === "draft" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleting(q)}
                    aria-label="Elimina bozza"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.75} />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elimina bozza</DialogTitle>
            <DialogDescription>
              La bozza <strong>{deleting?.number}</strong> sarà eliminata definitivamente.
              Questa operazione non può essere annullata.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleting && handleDelete(deleting)}
            >
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
