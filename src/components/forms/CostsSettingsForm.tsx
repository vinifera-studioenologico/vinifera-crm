"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod";

import type { CostsSettingsValues } from "@/schemas/cost";
import { updateCostsSettings } from "@/server/actions/costs";

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

const CostsSettingsClientSchema = z.object({
  defaultMarginPercent: z.string().min(1, "Campo obbligatorio"),
  estimatedMonthlyAnalyses: z.string().min(1, "Campo obbligatorio"),
});
type FormInput = z.infer<typeof CostsSettingsClientSchema>;

interface Props {
  defaultValues?: Partial<CostsSettingsValues>;
}

export function CostsSettingsForm({ defaultValues }: Props) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormInput>({
    resolver: zodResolver(CostsSettingsClientSchema),
    defaultValues: {
      defaultMarginPercent: String(defaultValues?.defaultMarginPercent ?? 5),
      estimatedMonthlyAnalyses: String(defaultValues?.estimatedMonthlyAnalyses ?? 100),
    },
  });

  function onSubmit() {
    const raw = form.getValues();
    startTransition(async () => {
      const result = await updateCostsSettings({
        defaultMarginPercent: parseFloat(raw.defaultMarginPercent),
        estimatedMonthlyAnalyses: parseInt(raw.estimatedMonthlyAnalyses, 10),
      });
      if (result.success) {
        toast.success("Impostazioni salvate");
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="defaultMarginPercent"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Margine target (%)</FormLabel>
              <FormControl>
                <Input type="number" min={0} max={100} step={0.5} {...field} className="max-w-xs" />
              </FormControl>
              <FormDescription>
                Margine minimo desiderato utilizzato nel calcolo del pricing suggerito.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="estimatedMonthlyAnalyses"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Analisi stimate al mese</FormLabel>
              <FormControl>
                <Input type="number" min={1} step={1} {...field} className="max-w-xs" />
              </FormControl>
              <FormDescription>
                Numero medio di analisi mensili usato per ripartire i costi fissi.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Salva impostazioni
        </Button>
      </form>
    </Form>
  );
}
