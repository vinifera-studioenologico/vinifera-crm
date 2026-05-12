import { FileText } from "lucide-react";

export default async function ClientQuotesPage() {

  return (
    <div className="p-4 md:p-6">
      <div className="rounded-xl border border-border bg-card p-16 flex flex-col items-center gap-3 text-center">
        <div className="size-12 rounded-full bg-muted flex items-center justify-center">
          <FileText className="size-5 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <p className="text-sm font-medium text-foreground">Preventivi</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          La gestione dei preventivi sarà disponibile nello STEP 7.
        </p>
      </div>
    </div>
  );
}
