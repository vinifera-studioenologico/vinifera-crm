"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileText, X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { prepareKitImport } from "@/server/actions/costs";
import type { KitImportPreparation } from "@/server/actions/costs";
import type { ParsedOffer } from "@/app/api/costs/parse-offer/route";

export type { ParsedOffer };

interface Props {
  onReady: (preparation: KitImportPreparation, parsedOffer: ParsedOffer, file: File | null) => void;
  onClear?: () => void;
}

type State =
  | { status: "idle" }
  | { status: "parsing" }
  | { status: "preparing" }
  | { status: "error"; message: string };

export function KitOfferUploader({ onReady, onClear }: Props) {
  const [state, setState] = useState<State>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  async function processFile(file: File) {
    setFileName(file.name);
    setState({ status: "parsing" });

    // 1) Parsing AI
    const formData = new FormData();
    formData.append("file", file);

    let parsed: ParsedOffer;
    try {
      const res = await fetch("/api/costs/parse-offer", { method: "POST", body: formData });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setState({ status: "error", message: body.error ?? "Errore durante il parsing" });
        return;
      }
      parsed = (await res.json()) as ParsedOffer;
    } catch {
      setState({ status: "error", message: "Errore di rete. Riprova." });
      return;
    }

    if (parsed.lines.length === 0) {
      toast.warning(
        parsed.warnings[0] ?? "Nessuna riga estratta dall'offerta. Verifica il documento.",
      );
    }

    // 2) Preparazione recap (server action)
    setState({ status: "preparing" });
    try {
      const preparation = await prepareKitImport({
        lines: parsed.lines,
        warnings: parsed.warnings,
      });
      onReady(preparation, parsed, file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore durante la preparazione del recap";
      setState({ status: "error", message: msg });
    }
  }

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function handleClear() {
    setState({ status: "idle" });
    setFileName(null);
    if (inputRef.current) inputRef.current.value = "";
    onClear?.();
  }

  if (state.status === "parsing" || state.status === "preparing") {
    return (
      <div className="rounded-xl border border-border p-8 flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" />
        <p className="text-sm">
          {state.status === "parsing"
            ? "Analisi offerta con AI in corso…"
            : "Preparazione recap…"}
        </p>
        {fileName && <p className="text-xs text-muted-foreground/70">{fileName}</p>}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3">
        <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm text-destructive">{state.message}</p>
        </div>
        <Button variant="ghost" size="icon" className="size-7" onClick={handleClear}>
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }

  // idle + file caricato (mostra brevemente prima che onReady chiuda il componente)
  if (fileName && state.status === "idle") {
    return (
      <div className="rounded-xl border border-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="size-4 text-green-500 shrink-0" />
          <span className="font-medium">{fileName}</span>
        </div>
        <Button variant="ghost" size="icon" className="size-7" onClick={handleClear}>
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "rounded-xl border-2 border-dashed p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors select-none",
        dragging
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50 hover:bg-muted/50",
      )}
    >
      <FileText className="size-10 text-muted-foreground/50" strokeWidth={1.25} />
      <div className="text-center">
        <p className="text-sm font-medium">Trascina qui l&apos;offerta fornitore</p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, JPEG, PNG, WEBP — max 10 MB (PDF) / 5 MB (immagine)
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
      >
        <Upload className="mr-2 size-4" />
        Sfoglia
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
