"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod";

import type { PaymentDoc } from "@/schemas/payment";
import { updatePayment } from "@/server/actions/payments";

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
import { Textarea } from "@/components/ui/textarea";

const EditPaymentClientSchema = z.object({
  paymentId: z.string(),
  description: z.string().min(1, "Descrizione obbligatoria").max(500),
  notes: z.string().max(1000).optional(),
});
type FormInput = z.infer<typeof EditPaymentClientSchema>;

interface Props {
  payment: PaymentDoc;
  onSuccess: () => void;
  onCancel: () => void;
}

export function EditPaymentForm({ payment, onSuccess, onCancel }: Props) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormInput>({
    resolver: zodResolver(EditPaymentClientSchema),
    defaultValues: {
      paymentId: payment.id,
      description: payment.description,
      notes: payment.notes ?? "",
    },
    mode: "onTouched",
  });

  function onSubmit() {
    const raw = form.getValues();
    startTransition(async () => {
      const result = await updatePayment(raw);
      if (result.success) {
        toast.success("Pagamento aggiornato");
        onSuccess();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrizione *</FormLabel>
              <FormControl>
                <Input {...field} />
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
