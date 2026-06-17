"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, ChevronsUpDown, Check } from "lucide-react";
import { z } from "zod";

import type { KitDoc } from "@/schemas/cost";
import type { AnalysisDoc } from "@/schemas/analysis";
import { createKit, updateKit } from "@/server/actions/costs";
import { formatEUR } from "@/lib/utils/money";
import { cn } from "@/lib/utils";

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
import { buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const KitClientSchema = z.object({
  supplierArticleCode: z.string().min(1, "Codice articolo obbligatorio").max(50),
  supplierName: z.string().max(200).optional(),
  name: z.string().min(1, "Nome obbligatorio").max(200),
  analysisId: z.string().min(1, "Seleziona un'analisi"),
  analysisCodeSnapshot: z.string(),
  analysisNameSnapshot: z.string(),
  numberOfTests: z.string().min(1, "Campo obbligatorio"),
  lastPurchasePriceCents: z.string().min(1, "Prezzo obbligatorio"),
});
type FormInput = z.infer<typeof KitClientSchema>;

interface Props {
  existing?: KitDoc;
  analyses: AnalysisDoc[];
  onSuccess?: () => void;
}

export function KitForm({ existing, analyses, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const form = useForm<FormInput>({
    resolver: zodResolver(KitClientSchema),
    defaultValues: {
      supplierArticleCode: existing?.supplierArticleCode ?? "",
      supplierName: existing?.supplierName ?? "",
      name: existing?.name ?? "",
      analysisId: existing?.analysisId ?? "",
      analysisCodeSnapshot: existing?.analysisCodeSnapshot ?? "",
      analysisNameSnapshot: existing?.analysisNameSnapshot ?? "",
      numberOfTests: existing ? String(existing.numberOfTests) : "1",
      lastPurchasePriceCents: existing
        ? String(existing.lastPurchasePriceCents / 100).replace(".", ",")
        : "",
    },
  });

  const selectedAnalysisId = form.watch("analysisId");
  const selectedAnalysis = analyses.find((a) => a.id === selectedAnalysisId);

  // Compute costPerTest for preview
  const rawPrice = form.watch("lastPurchasePriceCents");
  const rawTests = form.watch("numberOfTests");
  const parsedPrice = parseFloat(String(rawPrice).replace(",", ".")) * 100;
  const parsedTests = parseInt(String(rawTests), 10);
  const costPerTestPreview =
    !isNaN(parsedPrice) && parsedTests > 0
      ? Math.round(parsedPrice / parsedTests)
      : null;

  function onSubmit() {
    const raw = form.getValues();
    const payload = {
      ...raw,
      numberOfTests: parseInt(raw.numberOfTests, 10),
    };
    startTransition(async () => {
      const result = existing
        ? await updateKit(existing.id, payload, existing.version)
        : await createKit(payload);

      if (result.success) {
        toast.success(existing ? "Kit aggiornato" : "Kit creato");
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
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="supplierArticleCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Codice articolo fornitore *</FormLabel>
                <FormControl>
                  <Input placeholder="KIT-001" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="supplierName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fornitore</FormLabel>
                <FormControl>
                  <Input placeholder="Nome fornitore" {...field} />
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
              <FormLabel>Nome kit *</FormLabel>
              <FormControl>
                <Input placeholder="Kit acidità totale" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Analisi collegata — Combobox */}
        <FormField
          control={form.control}
          name="analysisId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Analisi collegata *</FormLabel>
              <Popover open={analysisOpen} onOpenChange={setAnalysisOpen}>
                <PopoverTrigger
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "w-full justify-between font-normal",
                    !field.value && "text-muted-foreground",
                  )}
                  role="combobox"
                  aria-expanded={analysisOpen}
                >
                  {selectedAnalysis
                    ? `${selectedAnalysis.code} — ${selectedAnalysis.name}`
                    : "Cerca un'analisi…"}
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder="Cerca per codice o nome…" />
                    <CommandList>
                      <CommandEmpty>Nessuna analisi trovata.</CommandEmpty>
                      <CommandGroup>
                        {analyses.map((a) => (
                          <CommandItem
                            key={a.id}
                            value={`${a.code} ${a.name}`}
                            onSelect={() => {
                              form.setValue("analysisId", a.id);
                              form.setValue("analysisCodeSnapshot", a.code);
                              form.setValue("analysisNameSnapshot", a.name);
                              setAnalysisOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 size-4",
                                field.value === a.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span className="font-mono text-xs mr-2 text-muted-foreground">
                              {a.code}
                            </span>
                            {a.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="numberOfTests"
            render={({ field }) => (
              <FormItem>
                <FormLabel>N° determinazioni *</FormLabel>
                <FormControl>
                  <Input type="number" min={1} step={1} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lastPurchasePriceCents"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prezzo ultimo acquisto (€) *</FormLabel>
                <FormControl>
                  <Input placeholder="450,00" {...field} />
                </FormControl>
                {existing && (
                  <p className="text-xs text-muted-foreground">
                    Attuale: {formatEUR(existing.lastPurchasePriceCents)}
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {costPerTestPreview !== null && (
          <p className="text-sm text-muted-foreground">
            Costo per determinazione:{" "}
            <span className="font-semibold text-foreground">
              {formatEUR(costPerTestPreview)}
            </span>
          </p>
        )}

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
