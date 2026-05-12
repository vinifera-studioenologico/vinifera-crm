"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod";

import type { AnalysisDoc } from "@/schemas/analysis";
import { createAnalysis, updateAnalysis } from "@/server/actions/analyses";
import { formatEUR } from "@/lib/utils/money";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

// Schema client costruito da zero — zodResolver richiede che input e output coincidano
const AnalysisClientSchema = z.object({
  code: z.string().min(1, "Codice obbligatorio").max(20).regex(/^[A-Z0-9\-]+$/i),
  name: z.string().min(1, "Nome obbligatorio").max(200),
  category: z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
  defaultPriceCents: z.string().min(1, "Importo obbligatorio"),
  unit: z.string().max(30).optional(),
  active: z.boolean(),
});
type FormInput = z.infer<typeof AnalysisClientSchema>;

interface Props {
  existing?: AnalysisDoc;
  onSuccess?: () => void;
}

export function AnalysisForm({ existing, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormInput>({
    resolver: zodResolver(AnalysisClientSchema),
    defaultValues: {
      code: existing?.code ?? "",
      name: existing?.name ?? "",
      category: existing?.category ?? "",
      description: existing?.description ?? "",
      // Mostra il valore EUR formattato (es. "12,50") per l'edit
      defaultPriceCents: existing
        ? String(existing.defaultPriceCents / 100).replace(".", ",")
        : "",
      unit: existing?.unit ?? "",
      active: existing?.active ?? true,
    },
  });

  function onSubmit() {
    // Invia i valori RAW (stringa per defaultPriceCents) al server,
    // che li ri-valida con AnalysisFormSchema (zEurInput converte la stringa in centesimi)
    const rawValues = form.getValues();
    startTransition(async () => {
      const result = existing
        ? await updateAnalysis(existing.id, rawValues, existing.version)
        : await createAnalysis(rawValues);

      if (result.success) {
        toast.success(existing ? "Analisi aggiornata" : "Analisi creata");
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-2 gap-5">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Codice *</FormLabel>
                <FormControl>
                  <Input
                    placeholder="AN-001"
                    {...field}
                    onChange={(e) =>
                      field.onChange(e.target.value.toUpperCase())
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="unit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unità</FormLabel>
                <FormControl>
                  <Input placeholder="mg/L" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome analisi *</FormLabel>
              <FormControl>
                <Input placeholder="Solforosa libera" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-5">
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categoria</FormLabel>
                <FormControl>
                  <Input placeholder="Chimica base" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="defaultPriceCents"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prezzo default *</FormLabel>
                <FormControl>
                  <Input
                    placeholder="12,50"
                    inputMode="decimal"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {field.value
                    ? (() => {
                        const n = parseFloat(
                          String(field.value).replace(",", "."),
                        );
                        return isNaN(n)
                          ? ""
                          : formatEUR(Math.round(n * 100));
                      })()
                    : "Inserire importo in euro"}
                </FormDescription>
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
                  placeholder="Note aggiuntive sull'analisi..."
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
            <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
              <div className="space-y-0.5">
                <FormLabel>Attiva nel listino</FormLabel>
                <FormDescription>
                  Solo le analisi attive sono selezionabili nei campioni e preventivi
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="size-3.5 animate-spin" />}
            {isPending ? "Salvataggio..." : existing ? "Aggiorna" : "Crea analisi"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
