"use client";

import { useTransition, useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod";

import type { PackageDoc } from "@/schemas/package";
import { purchasePackage } from "@/server/actions/clientPackages";
import { formatEUR } from "@/lib/utils/money";

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
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

// Schema client costruito da zero — zodResolver richiede che input e output coincidano
const ClientPackageClientSchema = z.object({
  clientId: z.string().min(1),
  packageId: z.string().min(1, "Scegli un pacchetto"),
  packageNameSnapshot: z.string(),
  totalAnalyses: z.number().int().min(1),
  priceCents: z.string().min(1, "Importo obbligatorio"),
  createPayment: z.boolean(),
  accontoCents: z.string().optional(),
  accontoDate: z.string().optional(),
  installmentsCount: z.number().int().min(1).max(60).optional(),
  firstDueDate: z.string().optional(),
  installmentPeriod: z.enum(["monthly", "biweekly", "custom"]).optional(),
  customInterval: z.number().int().min(1).optional(),
  customUnit: z.enum(["days", "months", "years"]).optional(),
}).superRefine((data, ctx) => {
  if (data.accontoDate && data.firstDueDate && data.accontoDate >= data.firstDueDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La data acconto deve essere precedente alla prima scadenza",
      path: ["accontoDate"],
    });
  }
});
type FormInput = z.infer<typeof ClientPackageClientSchema>;

interface Props {
  clientId: string;
  clientName: string;
  packages: PackageDoc[];
  onSuccess?: (id: string) => void;
}

export function ClientPackageForm({ clientId, clientName, packages, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();

  const activePackages = packages.filter((p) => p.active && p.deletedAt === null);

  const form = useForm<FormInput>({
    resolver: zodResolver(ClientPackageClientSchema),
    defaultValues: {
      clientId,
      packageId: "",
      packageNameSnapshot: "",
      totalAnalyses: 1,
      priceCents: "",
      createPayment: false,
      accontoCents: "",
      accontoDate: "",
      installmentsCount: 1,
      // eslint-disable-next-line react-hooks/purity
      firstDueDate: new Date(Date.now() + 30 * 86400 * 1000).toISOString().slice(0, 10),
      installmentPeriod: "monthly",
    },
    mode: "onTouched",
  });

  const selectedPackageId = useWatch({ control: form.control, name: "packageId" });
  const createPayment = useWatch({ control: form.control, name: "createPayment" });
  const installmentsCount = useWatch({ control: form.control, name: "installmentsCount" });
  const priceInput = useWatch({ control: form.control, name: "priceCents" });
  const accontoInput = useWatch({ control: form.control, name: "accontoCents" });
  const accontoDate = useWatch({ control: form.control, name: "accontoDate" });
  const installmentPeriod = useWatch({ control: form.control, name: "installmentPeriod" });

  // Quando si seleziona un template, precompila i campi
  useEffect(() => {
    if (!selectedPackageId) return;
    const pkg = activePackages.find((p) => p.id === selectedPackageId);
    if (!pkg) return;
    form.setValue("packageNameSnapshot", pkg.name);
    form.setValue("totalAnalyses", pkg.totalAnalyses);
    form.setValue(
      "priceCents",
      (pkg.priceCents / 100).toFixed(2).replace(".", ","),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPackageId]);

  // Calcola prezzo da stringa input
  const parsedCents = (() => {
    const raw = String(priceInput ?? "").replace(",", ".");
    const n = parseFloat(raw);
    return isNaN(n) ? 0 : Math.round(n * 100);
  })();

  const parsedAccontoCents = (() => {
    const raw = String(accontoInput ?? "").replace(",", ".");
    const n = parseFloat(raw);
    return isNaN(n) ? 0 : Math.round(n * 100);
  })();

  const hasAcconto = parsedAccontoCents > 0 && (installmentsCount ?? 1) > 1;
  const residuoCents = hasAcconto ? Math.max(0, parsedCents - parsedAccontoCents) : parsedCents;

  const perRataEur =
    createPayment && (installmentsCount ?? 1) > 1
      ? formatEUR(Math.round(residuoCents / (installmentsCount ?? 1)))
      : null;

  function onSubmit() {
    const raw = form.getValues();
    startTransition(async () => {
      const result = await purchasePackage(raw);
      if (result.success) {
        toast.success("Pacchetto acquistato");
        onSuccess?.(result.data.id);
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
        {/* Cliente (read-only) */}
        <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground mr-1">Cliente:</span>
          <span className="font-medium">{clientName}</span>
        </div>

        {/* Selezione template pacchetto */}
        <FormField
          control={form.control}
          name="packageId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pacchetto *</FormLabel>
              <FormControl>
                <select
                  className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                  {...field}
                >
                  <option value="">— Scegli pacchetto —</option>
                  {activePackages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.totalAnalyses} analisi · {formatEUR(p.priceCents)})
                    </option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {selectedPackageId && (
          <>
            {/* Numero analisi (read-only, dal template) */}
            <FormField
              control={form.control}
              name="totalAnalyses"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Analisi incluse</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      {...field}
                      value={String(field.value ?? 1)}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 1)
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    Puoi modificare il numero rispetto al template
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Prezzo (modificabile) */}
            <FormField
              control={form.control}
              name="priceCents"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prezzo di vendita (€)</FormLabel>
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
                  {parsedCents > 0 && (
                    <FormDescription>{formatEUR(parsedCents)}</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            {/* Pagamento */}
            <FormField
              control={form.control}
              name="createPayment"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <FormLabel>Crea pagamento</FormLabel>
                    <FormDescription>
                      Genera le rate di pagamento per questo acquisto
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={Boolean(field.value)}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {createPayment && (
              <div className="space-y-4 pl-1">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="installmentsCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Numero rate *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={60}
                            {...field}
                            value={String(field.value ?? 1)}
                            onChange={(e) =>
                              field.onChange(parseInt(e.target.value, 10) || 1)
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="firstDueDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prima scadenza *</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            value={field.value ?? ""}
                            min={accontoDate || undefined}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="installmentPeriod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cadenza</FormLabel>
                      <FormControl>
                        <select
                          className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                          {...field}
                          value={field.value ?? "monthly"}
                        >
                          <option value="monthly">Mensile</option>
                          <option value="biweekly">Bisettimanale</option>
                          <option value="custom">Personalizzato</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {installmentPeriod === "custom" && (
                  <div className="flex gap-2">
                    <FormField
                      control={form.control}
                      name="customInterval"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel>Ogni</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.valueAsNumber)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="customUnit"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel>Unità</FormLabel>
                          <FormControl>
                            <select
                              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                              {...field}
                              value={field.value ?? "months"}
                            >
                              <option value="days">Giorni</option>
                              <option value="months">Mesi</option>
                              <option value="years">Anni</option>
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {(installmentsCount ?? 1) > 1 && (
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="accontoCents"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Acconto già incassato (€)</FormLabel>
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
                          <FormDescription>
                            Importo già pagato — rata 0 saldata
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {hasAcconto && (
                      <FormField
                        control={form.control}
                        name="accontoDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Data acconto</FormLabel>
                            <FormControl>
                              <Input
                                type="date"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                )}

                {perRataEur && (
                  <p className="text-xs text-muted-foreground">
                    {hasAcconto
                      ? `Residuo ${formatEUR(residuoCents)} su ${installmentsCount ?? 1} rate da ~${perRataEur} cad.`
                      : `Circa ${perRataEur} per rata`}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        <Button type="submit" className="w-full" disabled={isPending || !selectedPackageId}>
          {isPending && <Loader2 className="size-3.5 animate-spin" />}
          {isPending ? "Acquisto in corso..." : "Acquista pacchetto"}
        </Button>
      </form>
    </Form>
  );
}
