"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod";

import type { GoalDoc } from "@/schemas/goal";
import { upsertGoal } from "@/server/actions/goals";
import { formatEUR } from "@/lib/utils/money";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const GoalClientSchema = z
  .object({
    revenueTargetCents: z.string().optional(),
    newBusinessClientsTarget: z.string().optional(),
    newPrivateClientsTarget: z.string().optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine(
    (d) => !!d.revenueTargetCents || !!d.newBusinessClientsTarget || !!d.newPrivateClientsTarget,
    { message: "Imposta almeno un obiettivo", path: ["revenueTargetCents"] },
  );
type FormInput = z.infer<typeof GoalClientSchema>;

interface Props {
  year: number;
  existing?: GoalDoc | null;
  onSuccess?: () => void;
}

export function GoalForm({ year, existing, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormInput>({
    resolver: zodResolver(GoalClientSchema),
    defaultValues: {
      revenueTargetCents:
        existing?.revenueTargetCents != null
          ? String(existing.revenueTargetCents / 100).replace(".", ",")
          : "",
      newBusinessClientsTarget:
        existing?.newBusinessClientsTarget != null ? String(existing.newBusinessClientsTarget) : "",
      newPrivateClientsTarget:
        existing?.newPrivateClientsTarget != null ? String(existing.newPrivateClientsTarget) : "",
      notes: existing?.notes ?? "",
    },
  });

  function onSubmit(values: FormInput) {
    startTransition(async () => {
      const result = await upsertGoal({
        year,
        revenueTargetCents: values.revenueTargetCents || undefined,
        newBusinessClientsTarget:
          values.newBusinessClientsTarget !== undefined && values.newBusinessClientsTarget !== ""
            ? parseInt(values.newBusinessClientsTarget, 10)
            : undefined,
        newPrivateClientsTarget:
          values.newPrivateClientsTarget !== undefined && values.newPrivateClientsTarget !== ""
            ? parseInt(values.newPrivateClientsTarget, 10)
            : undefined,
        notes: values.notes || undefined,
      });

      if (result.success) {
        toast.success("Obiettivi salvati");
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
        <FormField
          control={form.control}
          name="revenueTargetCents"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fatturato incassato {year} (€)</FormLabel>
              <FormControl>
                <Input placeholder="50.000,00" {...field} />
              </FormControl>
              {existing?.revenueTargetCents != null && (
                <p className="text-xs text-muted-foreground">
                  Attuale: {formatEUR(existing.revenueTargetCents)}
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="newBusinessClientsTarget"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nuove aziende {year}</FormLabel>
                <FormControl>
                  <Input type="number" min={0} placeholder="10" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="newPrivateClientsTarget"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nuovi privati {year}</FormLabel>
                <FormControl>
                  <Input type="number" min={0} placeholder="20" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note</FormLabel>
              <FormControl>
                <Textarea rows={2} placeholder="Note opzionali…" {...field} />
              </FormControl>
              <FormDescription>
                Lascia vuoto un campo per non impostare quella metrica: non comparirà come barra
                di avanzamento.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {existing ? "Aggiorna obiettivi" : "Salva obiettivi"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
