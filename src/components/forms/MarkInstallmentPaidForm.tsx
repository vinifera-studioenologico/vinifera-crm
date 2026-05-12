"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod";

import { MarkInstallmentPaidSchema } from "@/schemas/payment";
import type { InstallmentDoc } from "@/schemas/payment";
import { markInstallmentPaid } from "@/server/actions/payments";
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
import { Textarea } from "@/components/ui/textarea";

// Schema client costruito da zero — zodResolver richiede che input e output coincidano
const MarkInstallmentPaidClientSchema = z.object({
  paymentId: z.string(),
  installmentId: z.string(),
  paidAmountCents: z.string().min(1, "Importo obbligatorio"),
  method: z.enum(["cash", "bank_transfer", "card", "other"]),
  paidAt: z.string().min(1, "Data pagamento obbligatoria"),
  note: z.string().max(500).optional(),
});
type FormInput = z.infer<typeof MarkInstallmentPaidClientSchema>;

const METHOD_LABELS: Record<string, string> = {
  cash: "Contanti",
  bank_transfer: "Bonifico",
  card: "Carta",
  other: "Altro",
};

interface Props {
  paymentId: string;
  installment: InstallmentDoc;
  onSuccess: () => void;
  onCancel: () => void;
}

export function MarkInstallmentPaidForm({
  paymentId,
  installment,
  onSuccess,
  onCancel,
}: Props) {
  const [isPending, startTransition] = useTransition();

  const defaultAmount = (installment.amountCents / 100)
    .toFixed(2)
    .replace(".", ",");

  const form = useForm<FormInput>({
    resolver: zodResolver(MarkInstallmentPaidClientSchema),
    defaultValues: {
      paymentId,
      installmentId: installment.id,
      paidAmountCents: defaultAmount,
      method: "bank_transfer",
      paidAt: new Date().toISOString().slice(0, 10),
      note: "",
    },
    mode: "onTouched",
  });

  function onSubmit() {
    const raw = form.getValues();
    startTransition(async () => {
      const result = await markInstallmentPaid(raw);
      if (result.success) {
        toast.success("Incasso registrato");
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
          <span className="text-muted-foreground mr-1">Rata:</span>
          <span className="font-medium">{formatEUR(installment.amountCents)}</span>
        </div>

        {/* Importo incassato */}
        <FormField
          control={form.control}
          name="paidAmountCents"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Importo incassato (€) *</FormLabel>
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

        {/* Metodo */}
        <FormField
          control={form.control}
          name="method"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Metodo di pagamento *</FormLabel>
              <FormControl>
                <select
                  className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                  {...field}
                >
                  {Object.entries(METHOD_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Data pagamento */}
        <FormField
          control={form.control}
          name="paidAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Data pagamento *</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Nota */}
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nota interna</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Riferimento bonifico, note..."
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

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onCancel}
          >
            Annulla
          </Button>
          <Button type="submit" className="flex-1" disabled={isPending}>
            {isPending && <Loader2 className="size-3.5 animate-spin" />}
            {isPending ? "Registrazione..." : "Registra incasso"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
