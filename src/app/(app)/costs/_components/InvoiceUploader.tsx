"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileText, X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { type ParsedInvoiceItem, type ParsedExpense, type ParsedInvoiceResponse } from "@/app/api/costs/parse-invoice/route";

export type { ParsedInvoiceItem, ParsedExpense, ParsedInvoiceResponse };

// ← Mantenuto per compatibilità retroattiva con ExpenseForm
export type ParsedInvoice = ParsedExpense;

interface Props {
  onParsed: (result: ParsedInvoiceResponse, file: File) => void;
  onClear?: () => void;
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: ParsedInvoiceResponse; file: File }
  | { status: "error"; message: string };

export function InvoiceUploader({ onParsed, onClear }: Props) {
  const [state, setState] = useState<State>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function processFile(file: File) {
    setState({ status: "loading" });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/costs/parse-invoice", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setState({ status: "error", message: body.error ?? "Errore sconosciuto" });
        return;
      }

      const result = (await res.json()) as ParsedInvoiceResponse;
      setState({ status: "done", result, file });
      onParsed(result, file);
    } catch {
      setState({ status: "error", message: "Errore di rete. Riprova." });
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
    if (inputRef.current) inputRef.current.value = "";
    onClear?.();
  }

  if (state.status === "done") {
    const { result, file } = state;
    return (
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-green-500 shrink-0" />
            <span className="font-medium">
              {file.name}
            </span>
            <span className="text-muted-foreground">
              — {result.expenses.length}{" "}
              {result.expenses.length === 1 ? "spesa trovata" : "spese trovate"}
              {result.expenses.length > 0 && result.expenses[0]!.confidence > 0
                ? ` (${Math.round(result.expenses[0]!.confidence * 100)}% confidence)`
                : ""}
            </span>
          </div>
          <Button variant="ghost" size="icon" className="size-7" onClick={handleClear}>
            <X className="size-3.5" />
          </Button>
        </div>
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

  if (state.status === "loading") {
    return (
      <div className="rounded-xl border border-border p-8 flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" />
        <p className="text-sm">Analisi documento in corso…</p>
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
        <p className="text-sm font-medium">Trascina qui il documento (PDF o immagine)</p>
        <p className="text-xs text-muted-foreground mt-1">PDF, JPEG, PNG, WEBP — max 10 MB (PDF) / 5 MB (immagine)</p>
      </div>
      <Button variant="outline" size="sm" type="button" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
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
