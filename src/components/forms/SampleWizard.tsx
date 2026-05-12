"use client";

import { useState, useTransition } from "react";
import {
  useForm,
  FormProvider,
  useFormContext,
  useFieldArray,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Trash2, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import type { z } from "zod";

import { SampleFormSchema } from "@/schemas/sample";
import type { ClientDoc } from "@/schemas/client";
import type { AnalysisDoc } from "@/schemas/analysis";
import { createSample } from "@/server/actions/samples";
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

type FormInput = z.input<typeof SampleFormSchema>;

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
  const activeClients = clients.filter((c) => c.deletedAt === null);

  return (
    <div className="space-y-5">
      <FormField
        control={form.control}
        name="clientId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Cliente *</FormLabel>
            <FormControl>
              <select
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                {...field}
              >
                <option value="">— Seleziona cliente —</option>
                {activeClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
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

  const estimatedTotal = computeSampleTotal(
    (items ?? []).map((it) => ({
      unitPriceCents: typeof it.unitPriceCents === "number" ? it.unitPriceCents : 0,
      coveredByPackageId: it.coveredByPackageId,
      chargeAnyway: Boolean(it.chargeAnyway),
    })),
  );

  function addAnalysis(analysis: AnalysisDoc) {
    // Suggerisci il primo pacchetto disponibile con analisi rimaste
    const availablePkg = activePackages.find((p) => p.remainingAnalyses > 0);
    append({
      analysisId: analysis.id,
      analysisCodeSnapshot: analysis.code,
      analysisNameSnapshot: analysis.name,
      unitPriceCents: analysis.defaultPriceCents,
      coveredByPackageId: availablePkg?.id ?? undefined,
      chargeAnyway: false,
    } as never);
  }

  const activeAnalyses = analyses.filter((a) => a.active && a.deletedAt === null);

  return (
    <div className="space-y-4">
      {/* Lista analisi aggiunte */}
      {fields.length > 0 ? (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="divide-y divide-border">
            {fields.map((field, index) => {
              const item = items?.[index];
              const isCovered = item?.coveredByPackageId && !item.chargeAnyway;

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
                                {activePackages
                                  .filter((p) => p.remainingAnalyses > 0)
                                  .map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.packageNameSnapshot} ({p.remainingAnalyses} rimaste)
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
      ) : (
        <div className="rounded-xl border border-border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nessuna analisi aggiunta. Usa il listino sotto.
          </p>
        </div>
      )}

      {/* Listino analisi */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Aggiungi analisi dal listino
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-52 overflow-y-auto rounded-xl border border-border p-2">
          {activeAnalyses.map((a) => {
            const alreadyAdded = (items ?? []).some((it) => it.analysisId === a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => !alreadyAdded && addAnalysis(a)}
                disabled={alreadyAdded}
                className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  alreadyAdded
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:bg-muted cursor-pointer"
                }`}
              >
                <span>
                  <span className="font-mono text-xs text-muted-foreground mr-1.5">
                    {a.code}
                  </span>
                  {a.name}
                </span>
                <span className="tabular-nums text-xs text-muted-foreground shrink-0">
                  {formatEUR(a.defaultPriceCents)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Pagamento ─────────────────────────────────────────────────
function Step3({ estimatedTotal }: { estimatedTotal: number }) {
  const form = useFormContext<FormInput>();
  const createPayment = useWatch({ control: form.control, name: "createPayment" });
  const installmentsCount = useWatch({ control: form.control, name: "installmentsCount" });

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
                      type="number"
                      min={1}
                      max={60}
                      {...field}
                      value={String(field.value ?? 1)}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 1)
                      }
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
                    <Input type="date" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

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

          {estimatedTotal > 0 && (installmentsCount ?? 1) > 1 && (
            <p className="text-xs text-muted-foreground">
              Circa {formatEUR(Math.round(estimatedTotal / (installmentsCount ?? 1)))} per rata
            </p>
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

  const today = new Date().toISOString().slice(0, 10);
  // eslint-disable-next-line react-hooks/purity
  const nextMonth = new Date(Date.now() + 30 * 86400 * 1000).toISOString().slice(0, 10);

  const form = useForm<FormInput>({
    resolver: zodResolver(SampleFormSchema),
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
    },
    mode: "onTouched",
  });

  const items = useWatch({ control: form.control, name: "items" });

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
            form.setError(field as keyof FormInput, { message: messages[0] });
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
            <Step2 analyses={analyses} activePackages={activePackages} />
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
              disabled={isPending}
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
