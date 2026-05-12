"use client";

import { useEffect } from "react";
import Link from "next/link";
import { FlaskConical, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    // Logga l'errore in produzione potresti inviarlo a Sentry/Logtail
    console.error(error);
  }, [error]);

  return (
    <html lang="it">
      <body className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground text-center px-4 space-y-6 font-sans antialiased">
        <div className="size-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <FlaskConical className="size-8 text-destructive" strokeWidth={1.5} />
        </div>
        <div className="space-y-2">
          <p className="text-6xl font-bold tabular-nums">500</p>
          <h1 className="text-xl font-semibold">Errore del server</h1>
          <p className="text-sm text-muted-foreground max-w-xs">
            Si è verificato un errore imprevisto. Riprova o torna alla dashboard.
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground font-mono mt-1">
              ID: {error.digest}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={reset} className="gap-2">
            <RefreshCw className="size-3.5" strokeWidth={1.75} />
            Riprova
          </Button>
          <Link href="/dashboard">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="size-3.5" strokeWidth={1.75} />
              Dashboard
            </Button>
          </Link>
        </div>
      </body>
    </html>
  );
}
