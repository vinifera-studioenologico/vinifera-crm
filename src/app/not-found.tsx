import Link from "next/link";
import { FlaskConical, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center px-4 space-y-6">
      <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <FlaskConical className="size-8 text-primary" strokeWidth={1.5} />
      </div>
      <div className="space-y-2">
        <p className="text-6xl font-bold tabular-nums text-foreground">404</p>
        <h1 className="text-xl font-semibold text-foreground">Pagina non trovata</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          La pagina che stai cercando non esiste o è stata spostata.
        </p>
      </div>
      <Link href="/dashboard">
        <Button variant="outline" className="gap-2">
          <ArrowLeft className="size-3.5" strokeWidth={1.75} />
          Torna alla dashboard
        </Button>
      </Link>
    </div>
  );
}
