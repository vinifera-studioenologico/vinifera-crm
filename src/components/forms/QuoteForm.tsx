"use client";

import { useTransition } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { z } from "zod";

import { QuoteFormSchema } from "@/schemas/quote";
import type { QuoteDoc } from "@/schemas/quote";
import type { ClientDoc } from "@/schemas/client";
import type { AnalysisDoc } from "@/schemas/analysis";
import { createQuote, updateQuote } from "@/server/actions/quotes";
import { computeQuoteTotals } from "@/lib/calc/quote";
import { formatEUR } from "@/lib/utils/money";

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { QuoteItemsEditor } from "./QuoteItemsEditor";

type FormInput = z.input<typeof QuoteFormSchema>;

interface Props {
  existing?: QuoteDoc;
  clients: ClientDoc[];
  analyses: AnalysisDoc[];
  defaultClientId?: string;
  defaultEnpaiaApplied?: boolean;
  defaultEnpaiaPercent?: number;
  onSuccess?: (id: string, number: string) => void;
}

export function QuoteForm({
  existing,
  clients,
  analyses,
  defaultClientId,
  defaultEnpaiaApplied = false,
  defaultEnpaiaPercent = 4,
  onSuccess,
}: Props) {
  const [isPending, startTransition] = useTransition();

  const defaultTaxes = existing
    ? undefined // usa i valori salvati nel preventivo esistente
    : [
        { label: "IVA 22%", percent: 22, applied: false },
        { label: `ENPAIA ${defaultEnpaiaPercent}%`, percent: defaultEnpaiaPercent, applied: defaultEnpaiaApplied },
      ];

  const today = new Date().toISOString().slice(0, 10);
  // eslint-disable-next-line react-hooks/purity
  const thirtyDaysLater = new Date(Date.now() + 30 * 86400 * 1000)
    .toISOString()
    .slice(0, 10);

  const form = useForm<FormInput>({
    resolver: zodResolver(QuoteFormSchema),
    defaultValues: existing
      ? {
          clientId: existing.clientId,
          issuedAt: existing.issuedAt
            ? new Date(
                (existing.issuedAt as { toDate?: () => Date }).toDate?.() ?? existing.issuedAt as Date,
              )
                .toISOString()
                .slice(0, 10)
            : today,
          validUntil: existing.validUntil
            ? new Date(
                (existing.validUntil as { toDate?: () => Date }).toDate?.() ??
                  existing.validUntil as Date,
              )
                .toISOString()
                .slice(0, 10)
            : "",
          items: existing.items as never,
          discounts: existing.discounts,
          taxes: existing.taxes,
          notes: existing.notes ?? "",
        }
      : {
          clientId: defaultClientId ?? "",
          issuedAt: today,
          validUntil: thirtyDaysLater,
          items: [],
          discounts: [],
          taxes: defaultTaxes ?? [],
          notes: "",
        },
  });

  const {
    fields: discountFields,
    append: appendDiscount,
    remove: removeDiscount,
  } = useFieldArray({ control: form.control, name: "discounts" });

  const {
    fields: taxFields,
  } = useFieldArray({ control: form.control, name: "taxes" });

  const items = useWatch({ control: form.control, name: "items" });
  const discounts = useWatch({ control: form.control, name: "discounts" });
  const taxes = useWatch({ control: form.control, name: "taxes" });

  const totals = computeQuoteTotals({
    items: (items ?? []).map((it) => ({
      quantity: typeof it.quantity === "number" ? it.quantity : 0,
      unitPriceCents: typeof it.unitPriceCents === "number" ? it.unitPriceCents : 0,
    })),
    discounts: (discounts ?? []).map((d) => ({
      type: d.type,
      value: d.type === "fixed" ? Math.round((Number(d.value) || 0) * 100) : Number(d.value) || 0,
    })),
    taxes: (taxes ?? []).map((t) => ({
      percent: Number(t.percent) || 0,
      applied: Boolean(t.applied),
    })),
  });

  function onSubmit() {
    const rawValues = form.getValues();
    startTransition(async () => {
      const result = existing
        ? await updateQuote(existing.id, rawValues, existing.version)
        : await createQuote(rawValues);

      if (result.success) {
        if (existing) {
          toast.success("Preventivo aggiornato");
          onSuccess?.(existing.id, existing.number);
        } else {
          const r = result as { success: true; data: { id: string; number: string } };
          toast.success(`Preventivo ${r.data.number} creato`);
          onSuccess?.(r.data.id, r.data.number);
        }
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

  const activeClients = clients.filter((c) => c.deletedAt === null);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Intestazione */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="clientId"
            render={({ field }) => (
              <FormItem className="sm:col-span-1">
                <FormLabel>Cliente *</FormLabel>
                <FormControl>
                  <select
                    className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 disabled:opacity-50"
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
            name="issuedAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data emissione *</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="validUntil"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valido fino al</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator />

        {/* Voci */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Voci preventivo
          </p>
          <QuoteItemsEditor analyses={analyses.filter((a) => a.active && a.deletedAt === null)} />
        </div>

        <Separator />

        {/* Sconti */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sconti
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                appendDiscount({ label: "Sconto", type: "percent", value: 0 })
              }
            >
              <Plus className="size-3.5" strokeWidth={1.75} />
              Aggiungi sconto
            </Button>
          </div>

          {discountFields.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuno sconto applicato.</p>
          ) : (
            <div className="space-y-2">
              {discountFields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-[1fr_100px_90px_36px] gap-2 items-end">
                  <FormField
                    control={form.control}
                    name={`discounts.${index}.label`}
                    render={({ field: f }) => (
                      <FormItem>
                        {index === 0 && <FormLabel className="text-xs">Etichetta</FormLabel>}
                        <FormControl>
                          <Input placeholder="Sconto cliente..." {...f} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`discounts.${index}.type`}
                    render={({ field: f }) => (
                      <FormItem>
                        {index === 0 && <FormLabel className="text-xs">Tipo</FormLabel>}
                        <FormControl>
                          <select
                            className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                            {...f}
                          >
                            <option value="percent">%</option>
                            <option value="fixed">€ fisso</option>
                          </select>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`discounts.${index}.value`}
                    render={({ field: f }) => (
                      <FormItem>
                        {index === 0 && <FormLabel className="text-xs">Valore</FormLabel>}
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            {...f}
                            onChange={(e) => f.onChange(parseFloat(e.target.value) || 0)}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeDiscount(index)}
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.75} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Tasse */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Tasse e rivalse
          </p>
          <div className="space-y-2">
            {taxFields.map((field, index) => (
              <div key={field.id} className="flex items-center justify-between gap-4 py-1">
                <div className="flex items-center gap-2">
                  <FormField
                    control={form.control}
                    name={`taxes.${index}.applied`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormControl>
                          <Switch
                            checked={Boolean(f.value)}
                            onCheckedChange={f.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <span className="text-sm">{taxes?.[index]?.label ?? field.id}</span>
                </div>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {taxes?.[index]?.percent ?? 0}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Riepilogo totali */}
        <div className="rounded-xl bg-muted/40 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotale</span>
            <span className="tabular-nums">{formatEUR(totals.subtotalCents)}</span>
          </div>
          {totals.subtotalCents !== totals.discountedCents && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Dopo sconti</span>
              <span className="tabular-nums">{formatEUR(totals.discountedCents)}</span>
            </div>
          )}
          <Separator className="my-1" />
          <div className="flex justify-between font-semibold">
            <span>Totale</span>
            <span className="tabular-nums text-lg">{formatEUR(totals.totalCents)}</span>
          </div>
        </div>

        {/* Note */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Note sul preventivo, condizioni, ecc..."
                  rows={3}
                  className="resize-none"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="size-3.5 animate-spin" />}
            {isPending
              ? "Salvataggio..."
              : existing
                ? "Aggiorna preventivo"
                : "Crea preventivo"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
