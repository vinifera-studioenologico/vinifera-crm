"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatEUR } from "@/lib/utils/money";

import { InvoiceUploader, type ParsedInvoiceResponse, type ParsedExpense } from "./InvoiceUploader";
import { ExpenseForm } from "@/components/forms/ExpenseForm";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

// ── Stato riga recap multi-spesa ──────────────────────────────────────
interface EditableExpenseRow {
  expense: ParsedExpense;
  included: boolean;
  dateOverride: string;
  periodFromOverride: string;
  periodToOverride: string;
  supplierOverride: string;
}

export function NewExpenseClient() {
  const router = useRouter();
  const [parsed, setParsed] = useState<ParsedInvoiceResponse | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [multiRows, setMultiRows] = useState<EditableExpenseRow[]>([]);
  const [isSubmitting, startTransition] = useTransition();

  function handleParsed(result: ParsedInvoiceResponse, file: File) {
    setParsed(result);
    setDocFile(file);
    if (result.expenses.length > 1) {
      const today = new Date().toISOString().slice(0, 10);
      setMultiRows(
        result.expenses.map((e) => ({
          expense: e,
          included: true,
          dateOverride: today,
          periodFromOverride: e.periodFrom ?? "",
          periodToOverride: e.periodTo ?? "",
          supplierOverride: e.supplier ?? "",
        }))
      );
    }
  }

  function handleClear() {
    setParsed(null);
    setDocFile(null);
    setMultiRows([]);
  }

  // Batch submit N spese
  function handleMultiSubmit() {
    const selected = multiRows.filter((r) => r.included);
    if (selected.length === 0) {
      toast.error("Seleziona almeno una spesa");
      return;
    }
    const missingDate = selected.some((r) => !r.dateOverride);
    if (missingDate) {
      toast.error("Inserisci la data per tutte le spese selezionate");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      // Ogni spesa: totalCents è già in centesimi dalla risposta AI;
      // convertiamo in euro string perché ExpenseFormSchema usa zEurInput
      const expensesPayload = selected.map((r) => ({
        description: r.expense.description,
        category: r.expense.category,
        supplier: r.supplierOverride || "",
        invoiceNumber: r.expense.invoiceNumber ?? "",
        date: r.dateOverride,
        periodFrom: r.periodFromOverride || undefined,
        periodTo: r.periodToOverride || undefined,
        totalCents:
          r.expense.totalCents != null
            ? (r.expense.totalCents / 100).toFixed(2).replace(".", ",")
            : "0",
        notes: r.expense.notes ?? "",
        items: r.expense.items,
      }));
      formData.append("expenses", JSON.stringify(expensesPayload));
      if (docFile) formData.append("pdf", docFile);
      if (parsed?.fileHash) formData.append("fileHash", parsed.fileHash);

      try {
        const res = await fetch("/api/costs/expenses", { method: "POST", body: formData });
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          toast.error(body.error ?? "Errore durante il salvataggio");
          return;
        }
        toast.success(`${selected.length} spese create`);
        router.push("/costs/expenses");
      } catch {
        toast.error("Errore di rete. Riprova.");
      }
    });
  }

  // ── Caso singola/nessuna spesa → form classico ───────────────────
  const singleExpense =
    parsed && parsed.expenses.length <= 1 ? (parsed.expenses[0] ?? null) : null;

  const prefill = singleExpense
    ? {
        description: singleExpense.description,
        supplier: singleExpense.supplier ?? "",
        invoiceNumber: singleExpense.invoiceNumber ?? "",
        date: singleExpense.date ?? new Date().toISOString().slice(0, 10),
        totalCents:
          singleExpense.totalCents != null
            ? (singleExpense.totalCents / 100).toFixed(2).replace(".", ",")
            : "",
        category: singleExpense.category,
        notes: singleExpense.notes ?? "",
        periodFrom: singleExpense.periodFrom ?? "",
        periodTo: singleExpense.periodTo ?? "",
      }
    : undefined;

  return (
    <Tabs defaultValue="upload" className="space-y-6">
      <TabsList>
        <TabsTrigger value="upload">Upload documento</TabsTrigger>
        <TabsTrigger value="manual">Manuale</TabsTrigger>
      </TabsList>

      {/* ── Tab Upload ── */}
      <TabsContent value="upload" className="space-y-6">
        <InvoiceUploader onParsed={handleParsed} onClear={handleClear} />

        {/* Warnings */}
        {parsed && parsed.warnings.length > 0 && (
          <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              {parsed.warnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          </div>
        )}

        {/* Duplicate warning */}
        {parsed && parsed.duplicateExpenseIds.length > 0 && (
          <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <p>
              Questo file è già stato importato ({parsed.duplicateExpenseIds.length}{" "}
              {parsed.duplicateExpenseIds.length === 1 ? "spesa esistente" : "spese esistenti"}).
              Potresti stare creando un duplicato.
            </p>
          </div>
        )}

        {/* ── MULTI-SPESA: recap lista ── */}
        {parsed && parsed.expenses.length > 1 && (
          <>
            <Separator />
            <p className="text-sm font-medium">
              {parsed.expenses.length} spese trovate — seleziona quelle da importare
            </p>
            <div className="rounded-xl border border-border divide-y divide-border text-sm">
              {multiRows.map((row, idx) => (
                <div key={idx} className="flex items-start gap-3 px-4 py-3">
                  <Checkbox
                    checked={row.included}
                    onCheckedChange={(v) =>
                      setMultiRows((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx]!, included: !!v };
                        return next;
                      })
                    }
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{row.expense.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {row.expense.notes ?? ""}
                    </p>
                    <input
                      type="text"
                      value={row.supplierOverride}
                      placeholder="Titolo (es. Edison - Luce)"
                      onChange={(ev) =>
                        setMultiRows((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx]!, supplierOverride: ev.target.value };
                          return next;
                        })
                      }
                      className="mt-1.5 h-7 w-full rounded-md border border-input px-2 text-xs bg-background"
                    />
                    {(row.periodFromOverride || row.periodToOverride || row.expense.category === "utility") && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-xs text-muted-foreground">Periodo:</span>
                        <input
                          type="date"
                          value={row.periodFromOverride}
                          onChange={(ev) =>
                            setMultiRows((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx]!, periodFromOverride: ev.target.value };
                              return next;
                            })
                          }
                          className="h-7 rounded-md border border-input px-2 text-xs bg-background"
                        />
                        <span className="text-xs text-muted-foreground">→</span>
                        <input
                          type="date"
                          value={row.periodToOverride}
                          onChange={(ev) =>
                            setMultiRows((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx]!, periodToOverride: ev.target.value };
                              return next;
                            })
                          }
                          className="h-7 rounded-md border border-input px-2 text-xs bg-background"
                        />
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold tabular-nums">
                      {row.expense.totalCents != null
                        ? formatEUR(row.expense.totalCents)
                        : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.expense.confidence > 0
                        ? `${Math.round(row.expense.confidence * 100)}% conf.`
                        : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleMultiSubmit}
                disabled={
                  isSubmitting
                }
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Salvataggio…
                  </>
                ) : (
                  `Crea ${multiRows.filter((r) => r.included).length} spese`
                )}
              </Button>
            </div>
          </>
        )}

        {/* ── SINGOLA SPESA: form classico ── */}
        {parsed && parsed.expenses.length <= 1 && (
          <>
            <Separator />
            <p className="text-sm text-muted-foreground">
              {parsed.expenses.length === 0
                ? "Nessun dato estratto. Compila manualmente."
                : "Verifica e completa i dati estratti, poi salva la spesa."}
            </p>
            <ExpenseForm
              prefill={prefill}
              pdfFile={docFile ?? undefined}
              parsedItems={singleExpense?.items}
              fileHash={parsed?.fileHash}
              onSuccess={(id) => router.push(`/costs/expenses/${id}`)}
            />
          </>
        )}
      </TabsContent>

      {/* ── Tab Manuale ── */}
      <TabsContent value="manual">
        <ExpenseForm onSuccess={(id) => router.push(`/costs/expenses/${id}`)} />
      </TabsContent>
    </Tabs>
  );
}

