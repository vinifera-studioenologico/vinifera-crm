"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

// Error boundary per le route all'interno di (app)
export default function AppError({ error, reset }: Props) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <div className="size-12 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertTriangle className="size-5 text-destructive" strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Si è verificato un errore</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Non è stato possibile caricare questa pagina.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono mt-1">
            ID: {error.digest}
          </p>
        )}
      </div>
      <Button variant="outline" onClick={reset} size="sm" className="gap-2">
        <RefreshCw className="size-3.5" strokeWidth={1.75} />
        Riprova
      </Button>
    </div>
  );
}
