"use client";

import { useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod";

import { PackageFormSchema } from "@/schemas/package";
import type { PackageDoc } from "@/schemas/package";
import { createPackage, updatePackage } from "@/server/actions/packages";
import { formatEUR } from "@/lib/utils/money";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

// Schema client costruito da zero — zodResolver richiede che input e output coincidano
const PackageClientSchema = z.object({
  name: z.string().min(1, "Nome obbligatorio").max(200),
  description: z.string().max(1000).optional(),
  totalAnalyses: z.number().int().min(1).max(10000),
  priceCents: z.string().min(1, "Importo obbligatorio"),
  active: z.boolean(),
});
type FormInput = z.infer<typeof PackageClientSchema>;

interface Props {
  existing?: PackageDoc;
  onSuccess?: () => void;
}

export function PackageForm({ existing, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormInput>({
    resolver: zodResolver(PackageClientSchema),
    defaultValues: {
      name: existing?.name ?? "",
      description: existing?.description ?? "",
      totalAnalyses: existing?.totalAnalyses ?? 10,
      priceCents: existing
        ? String(existing.priceCents / 100).replace(".", ",")
        : "",
      active: existing?.active ?? true,
    },
  });

  function onSubmit() {
    // Invia i valori RAW al server per ri-validazione con zEurInput
    const rawValues = form.getValues();
    startTransition(async () => {
      const result = existing
        ? await updatePackage(existing.id, rawValues, existing.version)
        : await createPackage(rawValues);

      if (result.success) {
        toast.success(existing ? "Pacchetto aggiornato" : "Pacchetto creato");
        onSuccess?.();
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

  const priceInput = useWatch({ control: form.control, name: "priceCents" });
  const totalAnalyses = useWatch({ control: form.control, name: "totalAnalyses" });

  const pricePreview = (() => {
    if (!priceInput) return null;
    const n = parseFloat(String(priceInput).replace(",", "."));
    if (isNaN(n)) return null;
    return formatEUR(Math.round(n * 100));
  })();

  const perAnalysis = (() => {
    if (!priceInput || !totalAnalyses || totalAnalyses === 0) return null;
    const n = parseFloat(String(priceInput).replace(",", "."));
    if (isNaN(n)) return null;
    return formatEUR(Math.round((n * 100) / totalAnalyses));
  })();

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome pacchetto *</FormLabel>
              <FormControl>
                <Input placeholder="Pacchetto Base 50 analisi" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="totalAnalyses"
            render={({ field }) => (
              <FormItem>
                <FormLabel>N. analisi incluse *</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={10000}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="priceCents"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prezzo *</FormLabel>
                <FormControl>
                  <Input placeholder="500,00" inputMode="decimal" {...field} />
                </FormControl>
                {(pricePreview ?? perAnalysis) && (
                  <FormDescription>
                    {pricePreview}
                    {perAnalysis && ` · ${perAnalysis}/analisi`}
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrizione</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Cosa include il pacchetto..."
                  rows={2}
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="active"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <FormLabel>Attivo nel listino</FormLabel>
                <FormDescription>
                  Solo i pacchetti attivi sono acquistabili dai clienti
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="size-3.5 animate-spin" />}
            {isPending ? "Salvataggio..." : existing ? "Aggiorna" : "Crea pacchetto"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
