"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod";

import type { ExpenseDoc } from "@/schemas/cost";
import type { ParsedInvoiceItem } from "@/app/(app)/costs/_components/InvoiceUploader";
import { createExpense, updateExpense } from "@/server/actions/costs";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORY_LABELS: Record<string, string> = {
  supplier_invoice: "Bolla fornitore",
  utility: "Bolletta",
  maintenance: "Manutenzione",
  consumable: "Materiale consumo",
  kit_purchase: "Acquisto kit",
  other: "Altro",
};

const ExpenseClientSchema = z.object({
  description: z.string().min(1, "Descrizione obbligatoria").max(300),
  category: z.enum(["supplier_invoice", "utility", "maintenance", "consumable", "kit_purchase", "other"]),
  supplier: z.string().max(200).optional(),
  invoiceNumber: z.string().max(50).optional(),
  date: z.string().min(1, "Data obbligatoria"),
  periodFrom: z.string().optional(),
  periodTo: z.string().optional(),
  totalCents: z.string().min(1, "Importo obbligatorio"),
  notes: z.string().max(1000).optional(),
});
type FormInput = z.infer<typeof ExpenseClientSchema>;

interface Props {
  existing?: ExpenseDoc;
  /** Pre-filled values (e.g. from AI parsing) */
  prefill?: Partial<FormInput>;
  /** PDF file to upload together with the expense */
  pdfFile?: File;
  /** Items extracted by AI (stored as-is in cents) */
  parsedItems?: ParsedInvoiceItem[];
  /** SHA-256 hash of uploaded file for duplicate detection */
  fileHash?: string;
  onSuccess?: (id: string) => void;
}

export function ExpenseForm({ existing, prefill, pdfFile, parsedItems, fileHash, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();

  const todayISO = new Date().toISOString().slice(0, 10);

  const form = useForm<FormInput>({
    resolver: zodResolver(ExpenseClientSchema),
    defaultValues: {
      description: existing?.description ?? prefill?.description ?? "",
      category: existing?.category ?? prefill?.category ?? "supplier_invoice",
      supplier: existing?.supplier ?? prefill?.supplier ?? "",
      invoiceNumber: existing?.invoiceNumber ?? prefill?.invoiceNumber ?? "",
      date: existing?.date ?? prefill?.date ?? todayISO,
      periodFrom: existing?.periodFrom ?? prefill?.periodFrom ?? "",
      periodTo: existing?.periodTo ?? prefill?.periodTo ?? "",
      totalCents: existing
        ? String(existing.totalCents / 100).replace(".", ",")
        : (prefill?.totalCents ?? ""),
      notes: existing?.notes ?? prefill?.notes ?? "",
    },
  });

  const watchCategory = form.watch("category");
  const showSupplier = !["other", "consumable"].includes(watchCategory);
  const showPeriod = watchCategory === "utility";

  function onSubmit() {
    const rawValues = form.getValues();
    startTransition(async () => {
      // If we have a PDF file, use the Route Handler (multipart/form-data)
      if (pdfFile && !existing) {
        const formData = new FormData();
        Object.entries(rawValues).forEach(([k, v]) => {
          if (v !== undefined && v !== null) formData.append(k, String(v));
        });
        if (parsedItems && parsedItems.length > 0) {
          formData.append("items", JSON.stringify(parsedItems));
        }
        formData.append("pdf", pdfFile);
        if (fileHash) formData.append("fileHash", fileHash);

        try {
          const res = await fetch("/api/costs/expenses", {
            method: "POST",
            body: formData,
          });
          const body = (await res.json()) as { id?: string; error?: string; fieldErrors?: Record<string, string[]> };
          if (res.ok && body.id) {
            toast.success("Spesa salvata");
            onSuccess?.(body.id);
          } else {
            toast.error(body.error ?? "Errore durante il salvataggio");
            if (body.fieldErrors) {
              for (const [field, messages] of Object.entries(body.fieldErrors)) {
                form.setError(field as keyof FormInput, { message: (messages as string[])[0] });
              }
            }
          }
        } catch {
          toast.error("Errore di rete. Riprova.");
        }
        return;
      }

      // No PDF — use Server Action
      const result = existing
        ? await updateExpense(existing.id, rawValues, existing.version)
        : await createExpense(rawValues);

      if (result.success) {
        toast.success(existing ? "Spesa aggiornata" : "Spesa salvata");
        onSuccess?.(result.data?.id ?? existing?.id ?? "");
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
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrizione *</FormLabel>
              <FormControl>
                <Input placeholder="Acquisto reagenti…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categoria *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue>
                        {CATEGORY_LABELS[field.value] ?? field.value}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
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

          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data *</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {showPeriod && (
            <>
              <FormField
                control={form.control}
                name="periodFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Periodo da</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="periodTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Periodo a</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="supplier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Titolo</FormLabel>
                <FormControl>
                  <Input placeholder="Edison - Luce" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {showSupplier && (
            <FormField
              control={form.control}
              name="invoiceNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>N° bolla / fattura</FormLabel>
                  <FormControl>
                    <Input placeholder="DDT-2024-001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <FormField
          control={form.control}
          name="totalCents"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Importo totale (€) *</FormLabel>
              <FormControl>
                <Input placeholder="1.234,56" {...field} className="max-w-xs" />
              </FormControl>
              {existing && (
                <p className="text-xs text-muted-foreground">
                  Attuale: {formatEUR(existing.totalCents)}
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note</FormLabel>
              <FormControl>
                <Textarea rows={2} placeholder="Note opzionali…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {existing ? "Aggiorna" : "Salva spesa"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
