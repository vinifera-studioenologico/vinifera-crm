"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import {
  useForm,
  FormProvider,
  useFormContext,
  useFieldArray,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Trash2, ChevronRight, ChevronLeft, Loader2, Search, ChevronsUpDown, Check } from "lucide-react";
import { z } from "zod";

import { SampleFormSchema } from "@/schemas/sample";

// Local client schema: replaces zEurInput transform with z.string() so the
// form field values (strings) match the resolver's TFieldValues type.
// The server action accepts `unknown` and runs its own SampleFormSchema.parse().
const SampleWizardClientSchema = SampleFormSchema
  .extend({ accontoCents: z.string().optional() })
  .superRefine((data, ctx) => {
    if (data.accontoDate && data.firstDueDate && data.accontoDate >= data.firstDueDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La data acconto deve essere precedente alla prima scadenza",
        path: ["accontoDate"],
      });
    }
  });
import type { ClientDoc } from "@/schemas/client";
import type { AnalysisDoc } from "@/schemas/analysis";
import { createSample, getClientActivePkgs } from "@/server/actions/samples";
import { computeSampleTotal } from "@/lib/calc/sample";
import { formatEUR } from "@/lib/utils/money";

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type FormInput = z.infer<typeof SampleWizardClientSchema>;

interface ActivePackage {
  id: string;
  packageNameSnapshot: string;
  remainingAnalyses: number;
}

interface Props {
  clients: ClientDoc[];
  analyses: AnalysisDoc[];
  activePackages: ActivePackage[];   // per il cliente pre-selezionato
  defaultClientId?: string;
  onSuccess?: (id: string, code: string) => void;
}

// ── Step indicator ────────────────────────────────────────────────────
function StepIndicator({ current, total }: { current: number; total: number }) {
  const labels = ["Dati base", "Analisi", "Pagamento"];
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`size-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
              i < current
                ? "bg-primary text-primary-foreground"
                : i === current
                  ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {i + 1}
          </div>
          <span
            className={`text-sm hidden sm:block ${
              i === current ? "font-medium text-foreground" : "text-muted-foreground"
            }`}
          >
            {labels[i]}
          </span>
          {i < total - 1 && (
            <div className={`h-px w-8 ${i < current ? "bg-primary" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Dati base ─────────────────────────────────────────────────
function Step1({ clients }: { clients: ClientDoc[] }) {
  const form = useFormContext<FormInput>();
  const [clientPopoverOpen, setClientPopoverOpen] = useState(false);
  const activeClients = clients.filter((c) => c.deletedAt === null);

  return (
    <div className="space-y-5">
      <FormField
        control={form.control}
        name="clientId"
        render={({ field }) => {
          const selectedClient = activeClients.find((c) => c.id === field.value);
          return (
            <FormItem>
              <FormLabel>Cliente *</FormLabel>
              <Popover open={clientPopoverOpen} onOpenChange={setClientPopoverOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={clientPopoverOpen}
                      className="w-full justify-between h-8 px-2.5 text-sm font-normal"
                    >
                      <span className={selectedClient ? "" : "text-muted-foreground"}>
                        {selectedClient ? selectedClient.displayName : "— Seleziona cliente —"}
                      </span>
                      <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
                    </Button>
                  }
                />
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                  <Command>
                    <CommandInput placeholder="Cerca cliente…" />
                    <CommandList>
                      <CommandEmpty>Nessun cliente trovato.</CommandEmpty>
                      <CommandGroup>
                        {activeClients.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.displayName}
                            onSelect={() => {
                              field.onChange(c.id);
                              setClientPopoverOpen(false);
                            }}
                          >
                            <Check
                              className={`size-3.5 shrink-0 ${
                                field.value === c.id ? "opacity-100" : "opacity-0"
                              }`}
                            />
                            {c.displayName}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          );
        }}
      />

      <FormField
        control={form.control}
        name="sampleName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nome / riferimento campione *</FormLabel>
            <FormControl>
              <Input placeholder="es. Lotto A - Vino bianco 2025" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="receivedAt"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Data ricezione *</FormLabel>
            <FormControl>
              <Input type="date" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="notes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Note interne</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Note sul campione..."
                rows={2}
                className="resize-none"
                {...field}
                value={field.value ?? ""}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

// ── Step 2: Analisi ───────────────────────────────────────────────────
function Step2({
  analyses,
  activePackages,
}: {
  analyses: AnalysisDoc[];
  activePackages: ActivePackage[];
}) {
  const form = useFormContext<FormInput>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });
  const items = useWatch({ control: form.control, name: "items" });
  const [analysisSearch, setAnalysisSearch] = useState("");

  const estimatedTotal = computeSampleTotal(
    (items ?? []).map((it) => ({
      unitPriceCents: typeof it.unitPriceCents === "number" ? it.unitPriceCents : 0,
      coveredByPackageId: it.coveredByPackageId,
      chargeAnyway: Boolean(it.chargeAnyway),
    })),
  );

  function addAnalysis(analysis: AnalysisDoc) {
    // Conta gli slot già consumati nel form corrente (non ancora salvati)
    const currentItems = form.getValues("items") ?? [];
    const usedByPackage: Record<string, number> = {};
    for (const it of currentItems) {
      if (it.coveredByPackageId && !it.chargeAnyway) {
        usedByPackage[it.coveredByPackageId] = (usedByPackage[it.coveredByPackageId] ?? 0) + 1;
      }
    }
    // Primo pacchetto con slot effettivi rimasti
    const availablePkg = activePackages.find(
      (p) => p.remainingAnalyses - (usedByPackage[p.id] ?? 0) > 0,
    );
    append({
      analysisId: analysis.id,
      analysisCodeSnapshot: analysis.code,
      analysisNameSnapshot: analysis.name,
      unitSnapshot: analysis.unit ?? undefined,
      descriptionSnapshot: analysis.description ?? undefined,
      unitPriceCents: analysis.defaultPriceCents,
      coveredByPackageId: availablePkg?.id ?? undefined,
      chargeAnyway: false,
    } as never);
  }

  function toggleAnalysis(analysis: AnalysisDoc) {
    const existingIndex = (items ?? []).findIndex((it) => it.analysisId === analysis.id);
    if (existingIndex >= 0) {
      remove(existingIndex);
    } else {
      addAnalysis(analysis);
    }
  }

  const activeAnalyses = analyses
    .filter((a) => a.active && a.deletedAt === null)
    .sort((a, b) => a.name.localeCompare(b.name, "it"));

  const filteredAnalyses = analysisSearch
    ? activeAnalyses.filter((a) => {
        const q = analysisSearch.toLowerCase();
        return a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q);
      })
    : activeAnalyses;

  return (
    <div className="space-y-4">
      {/* Catalogo analisi — ricerca + checkbox */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Seleziona analisi
        </p>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Cerca per nome o codice…"
            className="pl-8 h-8 text-sm"
            value={analysisSearch}
            onChange={(e) => setAnalysisSearch(e.target.value)}
          />
        </div>
        <div className="rounded-xl border border-border divide-y divide-border">
          {filteredAnalyses.length === 0 ? (
            <p className="px-3 py-4 text-sm text-center text-muted-foreground">
              Nessuna analisi trovata
            </p>
          ) : (
            filteredAnalyses.map((a) => {
              const isSelected = (items ?? []).some((it) => it.analysisId === a.id);
              return (
                <label
                  key={a.id}
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 select-none transition-colors"
                >
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 cursor-pointer accent-primary"
                    checked={isSelected}
                    onChange={() => toggleAnalysis(a)}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="font-semibold text-sm">{a.name}</span>
                    <span className="font-mono text-xs text-muted-foreground ml-1.5">
                      {a.code}
                    </span>
                  </span>
                  <span className="tabular-nums text-xs text-muted-foreground shrink-0">
                    {formatEUR(a.defaultPriceCents)}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </div>

      {/* Analisi selezionate con impostazioni per riga */}
      {fields.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-3 py-2 border-b border-border bg-muted/20">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Analisi selezionate ({fields.length})
            </p>
          </div>
          <div className="divide-y divide-border">
            {fields.map((field, index) => {
              const item = items?.[index];
              const isCovered = item?.coveredByPackageId && !item.chargeAnyway;

              // Slot usati dagli ALTRI item (escluso questo) per ogni pacchetto
              const usedByOthers: Record<string, number> = {};
              for (let i = 0; i < (items ?? []).length; i++) {
                if (i === index) continue;
                const it = items![i];
                if (it?.coveredByPackageId && !it.chargeAnyway) {
                  usedByOthers[it.coveredByPackageId] = (usedByOthers[it.coveredByPackageId] ?? 0) + 1;
                }
              }
              const effectiveRemaining = (pkg: ActivePackage) =>
                Math.max(0, pkg.remainingAnalyses - (usedByOthers[pkg.id] ?? 0));
              const packagesForRow = activePackages.filter(
                (p) => effectiveRemaining(p) > 0 || p.id === item?.coveredByPackageId,
              );

              return (
                <div key={field.id} className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">
                        {item?.analysisCodeSnapshot} – {item?.analysisNameSnapshot}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isCovered ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            Coperto da pacchetto
                          </span>
                        ) : (
                          formatEUR(item?.unitPriceCents ?? 0)
                        )}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-3.5" strokeWidth={1.75} />
                    </Button>
                  </div>

                  {/* Pacchetti disponibili */}
                  {activePackages.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <FormField
                        control={form.control}
                        name={`items.${index}.coveredByPackageId` as never}
                        render={({ field: f }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <select
                                className="flex h-7 w-full rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus:border-ring"
                                value={String(f.value ?? "")}
                                onChange={(e) =>
                                  f.onChange(e.target.value || undefined)
                                }
                              >
                                <option value="">Non coperto da pacchetto</option>
                                {packagesForRow.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.packageNameSnapshot} ({effectiveRemaining(p)} rimaste)
                                  </option>
                                ))}
                              </select>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      {item?.coveredByPackageId && (
                        <FormField
                          control={form.control}
                          name={`items.${index}.chargeAnyway` as never}
                          render={({ field: f }) => (
                            <FormItem className="flex items-center gap-1.5">
                              <FormControl>
                                <Switch
                                  checked={Boolean(f.value)}
                                  onCheckedChange={f.onChange}
                                />
                              </FormControl>
                              <FormLabel className="text-xs text-muted-foreground cursor-pointer">
                                Addebita comunque
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer totale stimato */}
          <div className="flex justify-between items-center px-3 py-2.5 border-t border-border bg-muted/20 text-sm">
            <span className="text-muted-foreground">Totale stimato</span>
            <span className="font-semibold tabular-nums">{formatEUR(estimatedTotal)}</span>
          </div>
        </div>
      )}

      {fields.length === 0 && (
        <div className="rounded-xl border border-border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Seleziona le analisi dall&apos;elenco sopra.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Step 3: Pagamento ─────────────────────────────────────────────────
function Step3({ estimatedTotal }: { estimatedTotal: number }) {
  const form = useFormContext<FormInput>();
  const createPayment = useWatch({ control: form.control, name: "createPayment" });
  const installmentsCount = useWatch({ control: form.control, name: "installmentsCount" });
  const installmentPeriod = useWatch({ control: form.control, name: "installmentPeriod" });
  const firstDueDate = useWatch({ control: form.control, name: "firstDueDate" });
  const customInterval = useWatch({ control: form.control, name: "customInterval" });
  const customUnit = useWatch({ control: form.control, name: "customUnit" });
  const accontoInput = useWatch({ control: form.control, name: "accontoCents" });
  const accontoDate = useWatch({ control: form.control, name: "accontoDate" });

  const parsedAccontoCents = (() => {
    const raw = String(accontoInput ?? "").replace(",", ".");
    const n = parseFloat(raw);
    return isNaN(n) ? 0 : Math.round(n * 100);
  })();
  const hasAcconto = parsedAccontoCents > 0 && (installmentsCount ?? 1) > 1;
  const residuoCents = hasAcconto ? Math.max(0, estimatedTotal - parsedAccontoCents) : estimatedTotal;

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-muted/40 p-4 flex justify-between items-center">
        <span className="text-sm text-muted-foreground">Totale stimato campione</span>
        <span className="text-lg font-semibold tabular-nums">
          {formatEUR(estimatedTotal)}
        </span>
      </div>

      <FormField
        control={form.control}
        name="createPayment"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
            <div>
              <FormLabel>Crea pagamento</FormLabel>
              <FormDescription>
                Genera automaticamente le rate di pagamento per questo campione
              </FormDescription>
            </div>
            <FormControl>
              <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />

      {createPayment && (
        <div className="space-y-4 pl-1">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="installmentsCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Numero rate *</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      {...field}
                      value={field.value != null ? String(field.value) : ""}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        field.onChange(isNaN(n) ? undefined : n);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="firstDueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prima scadenza *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ""} min={accontoDate || undefined} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {(installmentsCount ?? 1) > 1 && (
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="accontoCents"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Acconto già incassato (€)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          €
                        </span>
                        <Input
                          className="pl-7"
                          placeholder="0,00"
                          {...field}
                          value={String(field.value ?? "")}
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Importo già pagato — rata 0 saldata
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {hasAcconto && (
                <FormField
                  control={form.control}
                  name="accontoDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data acconto</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          )}

          <FormField
            control={form.control}
            name="installmentPeriod"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cadenza rate</FormLabel>
                <FormControl>
                  <select
                    className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                    {...field}
                    value={field.value ?? "monthly"}
                  >
                    <option value="monthly">Mensile</option>
                    <option value="biweekly">Bisettimanale</option>
                    <option value="custom">Personalizzato</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {installmentPeriod === "custom" && (
            <div className="flex gap-2">
              <FormField
                control={form.control}
                name="customInterval"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Ogni</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customUnit"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Unità</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                        {...field}
                        value={field.value ?? "months"}
                      >
                        <option value="days">Giorni</option>
                        <option value="months">Mesi</option>
                        <option value="years">Anni</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          {estimatedTotal > 0 && createPayment && (
            <div className="rounded-xl bg-muted/40 p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Riepilogo pagamento</p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Totale</span>
                <span className="tabular-nums font-medium">{formatEUR(estimatedTotal)}</span>
              </div>
              {hasAcconto && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Acconto già incassato</span>
                  <span className="tabular-nums text-green-600 dark:text-green-400">−{formatEUR(parsedAccontoCents)}</span>
                </div>
              )}
              <Separator className="my-1" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {(installmentsCount ?? 1) === 1 ? "Soluzione unica" : `${installmentsCount ?? 1} rate da`}
                </span>
                <span className="tabular-nums">
                  {(installmentsCount ?? 1) === 1
                    ? formatEUR(estimatedTotal)
                    : `~${formatEUR(Math.round(residuoCents / (installmentsCount ?? 1)))} cad.`}
                </span>
              </div>
              {(installmentsCount ?? 1) > 1 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cadenza</span>
                  <span>
                    {installmentPeriod === "monthly" && "Mensile"}
                    {installmentPeriod === "biweekly" && "Bisettimanale"}
                    {installmentPeriod === "custom" &&
                      (customInterval
                        ? `Ogni ${customInterval} ${customUnit === "days" ? "giorni" : customUnit === "years" ? "anni" : "mesi"}`
                        : "Personalizzato")}
                  </span>
                </div>
              )}
              {firstDueDate && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {(installmentsCount ?? 1) === 1 ? "Scadenza" : "Prima scadenza"}
                  </span>
                  <span className="tabular-nums">
                    {new Date(firstDueDate + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Wizard principale ─────────────────────────────────────────────────
export function SampleWizard({
  clients,
  analyses,
  activePackages,
  defaultClientId,
  onSuccess,
}: Props) {
  const [step, setStep] = useState(0);
  const [isPending, startTransition] = useTransition();
  // overriddenPackages è null finché non cambia il cliente; in quel caso si usa activePackages
  // direttamente (rimane in sync automaticamente senza useEffect sincrono).
  const [overriddenPackages, setOverriddenPackages] = useState<ActivePackage[] | null>(null);
  const localPackages = overriddenPackages ?? activePackages;

  const today = new Date().toISOString().slice(0, 10);
  // eslint-disable-next-line react-hooks/purity
  const nextMonth = new Date(Date.now() + 30 * 86400 * 1000).toISOString().slice(0, 10);

  const form = useForm<FormInput>({
    resolver: zodResolver(SampleWizardClientSchema),
    defaultValues: {
      clientId: defaultClientId ?? "",
      sampleName: "",
      receivedAt: today,
      notes: "",
      items: [],
      createPayment: false,
      installmentsCount: 1,
      firstDueDate: nextMonth,
      installmentPeriod: "monthly",
      accontoCents: "",
      accontoDate: "",
    },
    mode: "onTouched",
  });

  const items = useWatch({ control: form.control, name: "items" });
  const watchedClientId = useWatch({ control: form.control, name: "clientId" });
  const prevClientIdRef = useRef(defaultClientId ?? "");

  useEffect(() => {
    if (watchedClientId === prevClientIdRef.current) return;
    prevClientIdRef.current = watchedClientId;
    // Clear items when client changes to avoid stale coveredByPackageId refs
    form.setValue("items", []);
    Promise.resolve(watchedClientId ? getClientActivePkgs(watchedClientId) : [])
      .then(setOverriddenPackages)
      .catch(() => setOverriddenPackages([]));
  }, [watchedClientId, form]);

  const estimatedTotal = computeSampleTotal(
    (items ?? []).map((it) => ({
      unitPriceCents: typeof it.unitPriceCents === "number" ? it.unitPriceCents : 0,
      coveredByPackageId: it.coveredByPackageId,
      chargeAnyway: Boolean(it.chargeAnyway),
    })),
  );

  async function validateStep(): Promise<boolean> {
    if (step === 0) {
      return form.trigger(["clientId", "sampleName", "receivedAt"]);
    }
    if (step === 1) {
      return form.trigger(["items"]);
    }
    return true;
  }

  async function handleNext() {
    const valid = await validateStep();
    if (valid) setStep((s) => s + 1);
  }

  function onSubmit() {
    const rawValues = form.getValues();
    startTransition(async () => {
      const result = await createSample(rawValues);
      if (result.success) {
        toast.success(`Campione ${result.data.code} creato`);
        onSuccess?.(result.data.id, result.data.code);
      } else {
        toast.error(result.error);
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            form.setError(field as keyof FormInput, { message: (messages as string[])[0] });
          }
        }
      }
    });
  }

  return (
    <FormProvider {...form}>
      <div>
        <StepIndicator current={step} total={3} />

        <div className="min-h-64">
          {step === 0 && <Step1 clients={clients} />}
          {step === 1 && (
            <Step2 analyses={analyses} activePackages={localPackages} />
          )}
          {step === 2 && <Step3 estimatedTotal={estimatedTotal} />}
        </div>

        <Separator className="my-6" />

        <div className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
          >
            <ChevronLeft className="size-3.5" strokeWidth={1.75} />
            Indietro
          </Button>

          {step < 2 ? (
            <Button type="button" onClick={handleNext}>
              Avanti
              <ChevronRight className="size-3.5" strokeWidth={1.75} />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => form.handleSubmit(onSubmit)()}
              disabled={isPending || !!form.formState.errors.accontoDate}
            >
              {isPending && <Loader2 className="size-3.5 animate-spin" />}
              {isPending ? "Creazione..." : "Crea campione"}
            </Button>
          )}
        </div>
      </div>
    </FormProvider>
  );
}
