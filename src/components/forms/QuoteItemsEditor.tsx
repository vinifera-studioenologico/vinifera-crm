"use client";

import { useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Plus, Trash2, GripVertical, Search } from "lucide-react";
import type { z } from "zod";

import { QuoteFormSchema } from "@/schemas/quote";
import type { AnalysisDoc } from "@/schemas/analysis";
import type { PackageDoc } from "@/schemas/package";
import { formatEUR } from "@/lib/utils/money";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

type FormInput = z.input<typeof QuoteFormSchema>;

interface Props {
  analyses: AnalysisDoc[];
  packages: PackageDoc[];
}

export function QuoteItemsEditor({ analyses, packages }: Props) {
  const form = useFormContext<FormInput>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const [open, setOpen] = useState(false);

  const items = useWatch({ control: form.control, name: "items" });

  function addFreeRow() {
    append({
      kind: "free",
      description: "",
      quantity: 1,
      unitPriceCents: 0,
    } as never);
  }

  function addAnalysisRow(analysis: AnalysisDoc) {
    append({
      kind: "analysis",
      analysisId: analysis.id,
      nameSnapshot: analysis.name,
      description: "",
      quantity: 1,
      unitPriceCents: analysis.defaultPriceCents,
    } as never);
    setOpen(false);
  }

  function addPackageRow(pkg: PackageDoc) {
    append({
      kind: "package",
      packageId: pkg.id,
      nameSnapshot: pkg.name,
      description: "",
      quantity: 1,
      unitPriceCents: pkg.priceCents,
    } as never);
    setOpen(false);
  }

  const subtotal = (items ?? []).reduce((acc, it) => {
    const qty = typeof it.quantity === "number" ? it.quantity : 0;
    const price = typeof it.unitPriceCents === "number" ? it.unitPriceCents : 0;
    return acc + Math.round(price * qty);
  }, 0);

  return (
    <div className="space-y-3">
      {/* Tabella voci */}
      <div className="rounded-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[auto_1fr_80px_110px_36px] gap-2 bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span className="w-5" />
          <span>Descrizione</span>
          <span className="text-right">Q.tà</span>
          <span className="text-right">Prezzo unit.</span>
          <span />
        </div>

        {/* Righe */}
        {fields.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            Nessuna voce aggiunta. Usa i pulsanti sotto per aggiungere voci.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {fields.map((field, index) => {
              const item = items?.[index];
              return (
                <div
                  key={field.id}
                  className="grid grid-cols-[auto_1fr_80px_110px_36px] gap-2 items-center px-3 py-2"
                >
                  {/* Drag handle placeholder */}
                  <GripVertical className="size-4 text-muted-foreground/40 cursor-grab" strokeWidth={1.5} />

                  {/* Descrizione */}
                  <div className="min-w-0 space-y-0.5">
                    {item?.kind === "analysis" && (
                      <Badge variant="secondary" className="text-[10px] h-4 mb-0.5">
                        {item.nameSnapshot}
                      </Badge>
                    )}
                    {item?.kind === "package" && (
                      <Badge variant="secondary" className="text-[10px] h-4 mb-0.5">
                        📦 {item.nameSnapshot}
                      </Badge>
                    )}
                    <FormField
                      control={form.control}
                      name={`items.${index}.description` as never}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              placeholder={
                                item?.kind === "analysis"
                                  ? "Descrizione opzionale"
                                  : "Descrizione voce..."
                              }
                              className="h-7 text-sm border-0 shadow-none px-0 focus-visible:ring-0"
                              {...f}
                              value={String(f.value ?? "")}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Quantità */}
                  <FormField
                    control={form.control}
                    name={`items.${index}.quantity` as never}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            type="number"
                            min={0.01}
                            step={0.01}
                            className="h-7 text-sm text-right"
                            {...f}
                            value={String(f.value ?? "")}
                            onChange={(e) =>
                              f.onChange(parseFloat(e.target.value) || 0)
                            }
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Prezzo unitario (EUR input) */}
                  <FormField
                    control={form.control}
                    name={`items.${index}.unitPriceCents` as never}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormControl>
                          <div className="relative">
                            <MoneyInput
                              className="h-7 text-sm text-right pr-7"
                              min={0}
                              valueCents={typeof f.value === "number" ? f.value : 0}
                              onValueChange={(cents) => f.onChange(cents ?? 0)}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                              €
                            </span>
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Elimina */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.75} />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer subtotale */}
        {fields.length > 0 && (
          <div className="flex justify-end px-3 py-2 border-t border-border bg-muted/20 text-sm">
            <span className="text-muted-foreground mr-2">Subtotale:</span>
            <span className="font-medium tabular-nums">{formatEUR(subtotal)}</span>
          </div>
        )}
      </div>

      {/* Pulsanti aggiungi */}
      <div className="flex gap-2 flex-wrap">
        <Button type="button" variant="outline" size="sm" onClick={addFreeRow}>
          <Plus className="size-3.5" strokeWidth={1.75} />
          Riga libera
        </Button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button type="button" variant="outline" size="sm">
                <Search className="size-3.5" strokeWidth={1.75} />
                Aggiungi voce
              </Button>
            }
          />
          <PopoverContent className="p-0 w-80" align="start">
            <Command>
              <CommandInput placeholder="Cerca analisi o pacchetto..." />
              <CommandList>
                <CommandEmpty>Nessun risultato trovato.</CommandEmpty>
                {packages.length > 0 && (
                  <CommandGroup heading="Pacchetti">
                    {packages.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={p.name}
                        onSelect={() => addPackageRow(p)}
                        className="flex justify-between gap-2"
                      >
                        <span className="flex gap-1.5 items-baseline min-w-0">
                          <span className="text-xs shrink-0">📦</span>
                          <span className="truncate">{p.name}</span>
                        </span>
                        <span className="tabular-nums text-xs text-muted-foreground shrink-0">
                          {formatEUR(p.priceCents)}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {analyses.length > 0 && (
                  <>
                    {packages.length > 0 && <CommandSeparator />}
                    <CommandGroup heading="Analisi">
                      {analyses.map((a) => (
                        <CommandItem
                          key={a.id}
                          value={`${a.code} ${a.name}`}
                          onSelect={() => addAnalysisRow(a)}
                          className="flex justify-between gap-2"
                        >
                          <span className="flex gap-1.5 items-baseline min-w-0">
                            <span className="font-mono text-xs text-muted-foreground shrink-0">
                              {a.code}
                            </span>
                            <span className="truncate">{a.name}</span>
                          </span>
                          <span className="tabular-nums text-xs text-muted-foreground shrink-0">
                            {formatEUR(a.defaultPriceCents)}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
