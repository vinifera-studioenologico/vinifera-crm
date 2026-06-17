"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod";

import type { FixedCostDoc } from "@/schemas/cost";
import { createFixedCost, updateFixedCost } from "@/server/actions/costs";
import { formatEUR } from "@/lib/utils/money";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FixedCostClientSchema = z.object({
  name: z.string().min(1, "Nome obbligatorio").max(200),
  description: z.string().max(500).optional(),
  amountCents: z.string().min(1, "Importo obbligatorio"),
  frequency: z.enum(["monthly", "quarterly", "annual"]),
  active: z.boolean(),
});
type FormInput = z.infer<typeof FixedCostClientSchema>;

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Mensile",
  quarterly: "Trimestrale",
  annual: "Annuale",
};

interface Props {
  existing?: FixedCostDoc;
  onSuccess?: () => void;
}

export function FixedCostForm({ existing, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormInput>({
    resolver: zodResolver(FixedCostClientSchema),
    defaultValues: {
      name: existing?.name ?? "",
      description: existing?.description ?? "",
      amountCents: existing
        ? String(existing.amountCents / 100).replace(".", ",")
        : "",
      frequency: existing?.frequency ?? "monthly",
      active: existing?.active ?? true,
    },
  });

  function onSubmit() {
    const rawValues = form.getValues();
    startTransition(async () => {
      const result = existing
        ? await updateFixedCost(existing.id, rawValues, existing.version)
        : await createFixedCost(rawValues);

      if (result.success) {
        toast.success(existing ? "Costo fisso aggiornato" : "Costo fisso creato");
        onSuccess?.();
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
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

        {/* Attivo — toggle in cima, stile riga compatta */}
        <FormField
          control={form.control}
          name="active"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div>
                <FormLabel className="text-sm font-medium">Costo attivo</FormLabel>
                <p className="text-xs text-muted-foreground mt-0.5">
                  I costi inattivi sono esclusi dal calcolo prorata
                </p>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome *</FormLabel>
              <FormControl>
                <Input placeholder="Affitto laboratorio" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="amountCents"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Importo (€) *</FormLabel>
                <FormControl>
                  <Input placeholder="1200,00" {...field} />
                </FormControl>
                {existing && (
                  <p className="text-xs text-muted-foreground">
                    Attuale: {formatEUR(existing.amountCents)}
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="frequency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Frequenza *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue>
                        {FREQUENCY_LABELS[field.value] ?? field.value}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Textarea rows={2} placeholder="Note opzionali…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="active"
          render={({ field }) => (
            <FormItem className="flex items-center gap-3">
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="!mt-0">Attivo</FormLabel>
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {existing ? "Aggiorna" : "Crea"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
