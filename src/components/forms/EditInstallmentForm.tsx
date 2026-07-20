"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod";

import type { InstallmentDoc } from "@/schemas/payment";
import { updateInstallment } from "@/server/actions/payments";
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

const EditInstallmentClientSchema = z.object({
  paymentId: z.string(),
  installmentId: z.string(),
  amountCents: z.string().min(1, "Importo obbligatorio"),
  dueDate: z.string().min(1, "Data di scadenza obbligatoria"),
});
type FormInput = z.infer<typeof EditInstallmentClientSchema>;

interface Props {
  paymentId: string;
  installment: InstallmentDoc;
  onSuccess: () => void;
  onCancel: () => void;
}

export function EditInstallmentForm({
  paymentId,
  installment,
  onSuccess,
  onCancel,
}: Props) {
  const [isPending, startTransition] = useTransition();

  const defaultAmount = (installment.amountCents / 100).toFixed(2).replace(".", ",");
  const defaultDueDate: string =
    installment.dueDate != null ? new Date(installment.dueDate).toISOString().slice(0, 10) : "";

  const form = useForm<FormInput>({
    resolver: zodResolver(EditInstallmentClientSchema),
    defaultValues: {
      paymentId,
      installmentId: installment.id,
      amountCents: defaultAmount,
      dueDate: defaultDueDate,
    },
    mode: "onTouched",
  });

  function onSubmit() {
    const raw = form.getValues();
    startTransition(async () => {
      const result = await updateInstallment(raw);
      if (result.success) {
        toast.success("Rata aggiornata");
        onSuccess();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground mr-1">Rata attuale:</span>
          <span className="font-medium">{formatEUR(installment.amountCents)}</span>
        </div>

        <FormField
          control={form.control}
          name="amountCents"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Importo (€) *</FormLabel>
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
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="dueDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Scadenza *</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            Annulla
          </Button>
          <Button type="submit" className="flex-1" disabled={isPending}>
            {isPending && <Loader2 className="size-3.5 animate-spin" />}
            {isPending ? "Salvataggio..." : "Salva modifiche"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
