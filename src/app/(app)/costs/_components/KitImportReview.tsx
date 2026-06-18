"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  Loader2,
  Info,
} from "lucide-react";
import { toast } from "sonner";

import type { KitImportPreparation, KitImportRow } from "@/server/actions/costs";
import type { ParsedOffer } from "@/app/api/costs/parse-offer/route";
import type { AnalysisDoc } from "@/schemas/analysis";
import { prepareKitImport } from "@/server/actions/costs";
import { toCents, formatEUR } from "@/lib/utils/money";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { buttonVariants } from "@/components/ui/button";

// ── Tabella codici → testo italiano ──────────────────────────────────
const CODE_MESSAGES: Record<string, string> = {
  needs_analysis: "Analisi non associata — selezionala",
  needs_tests: "Numero di test mancante — inseriscilo",
  bad_price: "Prezzo unitario non valido",
  already_exists: "Kit già presente: verrà aggiornato",
  big_price_change: "Variazione di prezzo rilevante (>30%)",
  no_analysis_match: "Nessuna analisi corrispondente trovata",
  uncertain_match: "Analisi suggerita — verificala",
  ambiguous_match: "Più analisi simili (possibile clone) — scegli quella giusta",
  price_mismatch: "Prezzo unitario × quantità non combacia col totale riga",
  low_confidence: "Lettura AI incerta su questa riga",
  duplicate_article: "Codice articolo ripetuto nell'offerta",
};

function codeToMsg(code: string): string {
  return CODE_MESSAGES[code] ?? code;
}

// ── Stato editabile per riga ──────────────────────────────────────────
interface EditableRow {
  originalRow: KitImportRow;
  included: boolean;
  unitPriceInput: string;
  testsInput: string;
  analysisId: string;
}

function initEditable(row: KitImportRow): EditableRow {
  return {
    originalRow: row,
    included: true,
    unitPriceInput: (row.unitPriceCents / 100).toFixed(2).replace(".", ","),
    testsInput: row.numberOfTests != null ? String(row.numberOfTests) : "",
    analysisId: row.analysisId ?? "",
  };
}

function derivedBlockers(row: EditableRow): string[] {
  const b: string[] = [];
  const tests = parseInt(row.testsInput, 10);
  if (isNaN(tests) || tests < 1) b.push("needs_tests");
  if (toCents(row.unitPriceInput) <= 0) b.push("bad_price");
  return b;
}

// ── Props ─────────────────────────────────────────────────────────────
interface Props {
  preparation: KitImportPreparation;
  parsedOffer: ParsedOffer;
  file: File | null;
  analyses: AnalysisDoc[];
  onClose: () => void;
}

export function KitImportReview({ preparation, parsedOffer, file, analyses, onClose }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // ── Stato righe editabili ─────────────────────────────────────────
  const [rows, setRows] = useState<EditableRow[]>(() =>
    preparation.rows.map(initEditable),
  );

  // ── Stato spesa ───────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const defaultDesc = [
    "Offerta",
    parsedOffer.offerNumber,
    parsedOffer.supplier,
  ]
    .filter(Boolean)
    .join(" ");

  const [includeExpense, setIncludeExpense] = useState(true);
  const [expenseDesc, setExpenseDesc] = useState(defaultDesc || "Acquisto kit");
  const [expenseDate, setExpenseDate] = useState(parsedOffer.date ?? today);
  const [expenseTotal, setExpenseTotal] = useState(
    parsedOffer.totalCents != null
      ? (parsedOffer.totalCents / 100).toFixed(2).replace(".", ",")
      : "",
  );

  // ── Combobox open state ───────────────────────────────────────────
  const [openComboboxIdx, setOpenComboboxIdx] = useState<number | null>(null);

  // ── Mappa analisi per id ──────────────────────────────────────────
  const analysesById = useMemo(
    () => new Map(analyses.map((a) => [a.id, a])),
    [analyses],
  );

  // ── Derivazioni live ──────────────────────────────────────────────
  const includedRows = rows.filter((r) => r.included);

  // blockers su righe incluse
  const hasUnresolved = includedRows.some((r) => derivedBlockers(r).length > 0);

  const submitDisabled = hasUnresolved || isPending;

  // counters
  const newCount = includedRows.filter((r) => r.originalRow.action === "create").length;
  const updateCount = includedRows.filter((r) => r.originalRow.action === "update").length;
  const ignoredCount = rows.filter((r) => !r.included).length;

  // ── Helpers ───────────────────────────────────────────────────────
  function updateRow(idx: number, patch: Partial<EditableRow>) {
    setRows((prev) => {
      const next = [...prev];
      const updated = { ...next[idx]!, ...patch };
      // se ora i blockers sono risolti, non forzare included
      next[idx] = updated;
      return next;
    });
  }

  function toggleIncluded(idx: number, checked: boolean) {
    updateRow(idx, { included: checked });
  }

  // ── Submit ────────────────────────────────────────────────────────
  function handleSubmit() {
    const selectedRows = rows.filter((r) => r.included);

    const lines = selectedRows.map((r) => {
      const orig = r.originalRow;
      const base = {
        action: orig.action,
        supplierArticleCode: orig.articleCode ?? "",
        supplierName: parsedOffer.supplier ?? undefined,
        name: orig.name,
        analysisId: r.analysisId || undefined,
        numberOfTests: parseInt(r.testsInput, 10),
        lastPurchasePriceCents: toCents(r.unitPriceInput),
      };
      if (orig.action === "update") {
        return {
          ...base,
          kitId: orig.existingKitId!,
          expectedVersion: orig.existingKitVersion!,
        };
      }
      return base;
    });

    const expense = includeExpense
      ? {
          description: expenseDesc,
          date: expenseDate,
          totalCents: toCents(expenseTotal),
          supplier: parsedOffer.supplier ?? undefined,
          invoiceNumber: parsedOffer.offerNumber ?? undefined,
        }
      : null;

    startTransition(async () => {
      const fd = new FormData();
      fd.append("payload", JSON.stringify({ lines, expense }));
      if (file) fd.append("file", file);

      try {
        const res = await fetch("/api/costs/import-kit-offer", { method: "POST", body: fd });

        if (res.status === 409) {
          toast.error("Alcuni kit sono stati modificati altrove. Ricarico il recap…");
          // Ricarica preparazione
          try {
            const newPrep = await prepareKitImport({
              lines: parsedOffer.lines,
              warnings: parsedOffer.warnings,
            });
            setRows(newPrep.rows.map(initEditable));
          } catch {
            toast.error("Impossibile ricaricare il recap. Chiudi e riprova.");
          }
          return;
        }

        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          toast.error(body.error ?? "Errore durante l'importazione");
          return;
        }

        const data = (await res.json()) as { created: number; updated: number };
        const parts = [];
        if (data.created > 0) parts.push(`${data.created} kit creati`);
        if (data.updated > 0) parts.push(`${data.updated} kit aggiornati`);
        if (includeExpense) parts.push("spesa registrata");
        toast.success(parts.join(", ") || "Import completato");
        onClose();
        router.refresh();
      } catch {
        toast.error("Errore di rete. Riprova.");
      }
    });
  }

  // ── Render ────────────────────────────────────────────────────────
  const allWarnings: string[] = [
    ...preparation.globalWarnings,

  ];

  return (
    <div className="space-y-6">
      {/* Header offerta */}
      <div className="text-sm text-muted-foreground space-y-0.5">
        {parsedOffer.supplier && (
          <p>
            <span className="font-medium text-foreground">{parsedOffer.supplier}</span>
            {parsedOffer.offerNumber && (
              <span> · Offerta n.{parsedOffer.offerNumber}</span>
            )}
            {parsedOffer.date && <span> · {parsedOffer.date}</span>}
          </p>
        )}
        {parsedOffer.totalCents != null && (
          <p>
            Totale offerta:{" "}
            <span className="font-medium text-foreground">
              {formatEUR(parsedOffer.totalCents)}
            </span>
            {parsedOffer.confidence > 0 && (
              <span className="ml-2 text-muted-foreground/70">
                · Confidence AI: {Math.round(parsedOffer.confidence * 100)}%
              </span>
            )}
          </p>
        )}
      </div>

      {/* Pannello anomalie */}
      {allWarnings.length > 0 && (
        <div className="rounded-xl border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-4 shrink-0" />
            Da controllare
          </div>
          <ul className="ml-6 space-y-0.5 list-disc">
            {allWarnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-700 dark:text-amber-400">
                {codeToMsg(w)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tabella righe */}
      <div className="rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 w-8" />
              <th className="px-3 py-2">Codice</th>
              <th className="px-3 py-2">Descrizione</th>
              <th className="px-3 py-2 text-right w-14">Q.tà</th>
              <th className="px-3 py-2 w-28">P.unit. (€)</th>
              <th className="px-3 py-2 w-20">N.test</th>
              <th className="px-3 py-2 w-52">Analisi</th>
              <th className="px-3 py-2 text-right w-20">€/test</th>
              <th className="px-3 py-2 w-24">Stato</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const blockers = derivedBlockers(row);
              const selectedAnalysis = row.analysisId ? analysesById.get(row.analysisId) : null;

              const unitCents = toCents(row.unitPriceInput);
              const tests = parseInt(row.testsInput, 10);
              const costPerTest =
                unitCents > 0 && tests > 0 ? Math.round(unitCents / tests) : null;

              const orig = row.originalRow;

              return (
                <tr
                  key={idx}
                  className={cn(
                    "border-t border-border",
                    !row.included && "opacity-50",
                  )}
                >
                  {/* Checkbox */}
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={row.included}
                      onCheckedChange={(v) => toggleIncluded(idx, !!v)}
                    />
                  </td>

                  {/* Codice */}
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {orig.articleCode ?? "—"}
                  </td>

                  {/* Descrizione */}
                  <td className="px-3 py-2 max-w-[200px]">
                    <p className="truncate" title={orig.description}>
                      {orig.description}
                    </p>
                    {orig.format && (
                      <p className="text-xs text-muted-foreground">{orig.format}</p>
                    )}
                    {/* Blockers */}
                    {blockers.map((b) => (
                      <p key={b} className="text-xs text-destructive mt-0.5">
                        ⚠ {codeToMsg(b)}
                      </p>
                    ))}
                    {/* Anomalies non bloccanti */}
                    {orig.anomalies
                      .filter((a) => !blockers.includes(a))
                      .map((a) => (
                        <p key={a} className="text-xs text-amber-600 mt-0.5">
                          <Info className="inline size-3 mr-0.5" />
                          {codeToMsg(a)}
                        </p>
                      ))}
                  </td>

                  {/* Q.tà */}
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {orig.quantity}
                  </td>

                  {/* Prezzo unitario */}
                  <td className="px-3 py-2">
                    <Input
                      value={row.unitPriceInput}
                      onChange={(e) => updateRow(idx, { unitPriceInput: e.target.value })}
                      className="h-7 text-xs w-24 tabular-nums"
                      placeholder="0,00"
                    />
                  </td>

                  {/* N.test */}
                  <td className="px-3 py-2">
                    <Input
                      value={row.testsInput}
                      onChange={(e) => updateRow(idx, { testsInput: e.target.value })}
                      className="h-7 text-xs w-16 tabular-nums"
                      placeholder="100"
                      type="number"
                      min={1}
                    />
                  </td>

                  {/* Analisi combobox */}
                  <td className="px-3 py-2">
                    <Popover
                      open={openComboboxIdx === idx}
                      onOpenChange={(open) => setOpenComboboxIdx(open ? idx : null)}
                    >
                      <PopoverTrigger
                        className={cn(
                          buttonVariants({ variant: "outline" }),
                          "h-7 text-xs w-48 justify-between font-normal truncate",
                          !row.analysisId && "text-muted-foreground",
                        )}
                        role="combobox"
                      >
                        <span className="truncate">
                          {selectedAnalysis
                            ? `${selectedAnalysis.code} — ${selectedAnalysis.name}`
                            : "Seleziona analisi…"}
                        </span>
                        <ChevronsUpDown className="ml-1 size-3 shrink-0 opacity-50" />
                      </PopoverTrigger>
                      <PopoverContent className="w-[360px] p-0">
                        <Command>
                          <CommandInput placeholder="Cerca per codice o nome…" className="text-xs" />
                          <CommandList>
                            <CommandEmpty>Nessuna analisi trovata.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="__none__"
                                onSelect={() => {
                                  updateRow(idx, { analysisId: "" });
                                  setOpenComboboxIdx(null);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 size-4",
                                    !row.analysisId ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                <span className="text-muted-foreground italic">Nessuna analisi</span>
                              </CommandItem>
                              {analyses.map((a) => (
                                <CommandItem
                                  key={a.id}
                                  value={`${a.code} ${a.name}`}
                                  onSelect={() => {
                                    updateRow(idx, { analysisId: a.id });
                                    setOpenComboboxIdx(null);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 size-4",
                                      row.analysisId === a.id ? "opacity-100" : "opacity-0",
                                    )}
                                  />
                                  <span className="font-mono text-xs mr-2">{a.code}</span>
                                  {a.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </td>

                  {/* €/test */}
                  <td className="px-3 py-2 text-right tabular-nums text-xs">
                    {costPerTest != null ? formatEUR(costPerTest) : "—"}
                  </td>

                  {/* Badge stato */}
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {!row.included ? (
                        <Badge variant="secondary" className="text-xs">Ignora</Badge>
                      ) : orig.action === "update" ? (
                        <Badge variant="default" className="text-xs bg-blue-500 hover:bg-blue-600">
                          Aggiorna
                          {orig.existingPriceCents != null && orig.existingPriceCents !== toCents(row.unitPriceInput) && (
                            <span className="ml-1 opacity-80">
                              {orig.existingPriceCents < toCents(row.unitPriceInput) ? "↑" : "↓"}
                            </span>
                          )}
                        </Badge>
                      ) : (
                        <Badge variant="default" className="text-xs bg-green-600 hover:bg-green-700">
                          Nuovo
                        </Badge>
                      )}
                      {orig.anomalies.includes("ambiguous_match") && (
                        <Badge variant="outline" className="text-xs border-amber-400 text-amber-600">
                          Clone?
                        </Badge>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Separator />

      {/* Sezione spesa */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Switch
            id="include-expense"
            checked={includeExpense}
            onCheckedChange={setIncludeExpense}
          />
          <Label htmlFor="include-expense" className="text-sm font-medium">
            Registra anche la spesa (categoria: Acquisto kit)
          </Label>
        </div>

        {includeExpense && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pl-9">
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">Descrizione spesa</Label>
              <Input
                value={expenseDesc}
                onChange={(e) => setExpenseDesc(e.target.value)}
                className="h-8 text-sm"
                placeholder="Offerta kit fornitore"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data</Label>
              <Input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Totale spesa (€)</Label>
              <Input
                value={expenseTotal}
                onChange={(e) => setExpenseTotal(e.target.value)}
                className="h-8 text-sm tabular-nums"
                placeholder="0,00"
              />
            </div>
          </div>
        )}
      </div>

      {/* Riepilogo + azioni */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {newCount > 0 && <span>{newCount} nuovi</span>}
          {newCount > 0 && updateCount > 0 && " · "}
          {updateCount > 0 && <span>{updateCount} aggiornati</span>}
          {(newCount > 0 || updateCount > 0) && ignoredCount > 0 && " · "}
          {ignoredCount > 0 && <span>{ignoredCount} ignorati</span>}
          {includeExpense && expenseTotal && (
            <span className="ml-2">
              · spesa{" "}
              <span className="font-medium text-foreground">
                {formatEUR(toCents(expenseTotal))}
              </span>
            </span>
          )}
        </p>

        <div className="flex items-center gap-3">
          {submitDisabled && !isPending && (
            <p className="text-xs text-destructive">
              {hasUnresolved
                ? "Risolvi i blockers nelle righe incluse"
                : "Due righe incluse con la stessa analisi"}
            </p>
          )}
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={submitDisabled || includedRows.length === 0}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Importazione…
              </>
            ) : (
              `Importa ${includedRows.length} kit`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
