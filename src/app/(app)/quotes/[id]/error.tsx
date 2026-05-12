"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function QuoteError({ error, reset }: Props) {
  const router = useRouter();
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center px-4">
      <div className="size-12 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertTriangle className="size-5 text-destructive" strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Impossibile caricare il preventivo</h2>
        <p className="text-sm text-muted-foreground">Il preventivo non è disponibile o si è verificato un errore.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => router.back()} size="sm" className="gap-2">
          <ArrowLeft className="size-3.5" strokeWidth={1.75} />Indietro
        </Button>
        <Button variant="ghost" onClick={reset} size="sm" className="gap-2">
          <RefreshCw className="size-3.5" strokeWidth={1.75} />Riprova
        </Button>
      </div>
    </div>
  );
}
