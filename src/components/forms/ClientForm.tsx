"use client";

import { useTransition, useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Building2, User } from "lucide-react";
import type { z } from "zod";

import { ClientFormSchema } from "@/schemas/client";
import type { ClientDoc } from "@/schemas/client";
import { createClient, updateClient } from "@/server/actions/clients";

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
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type FormInput = z.input<typeof ClientFormSchema>;

interface Props {
  existing?: ClientDoc;
  onSuccess?: (id: string) => void;
}

export function ClientForm({ existing, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormInput>({
    resolver: zodResolver(ClientFormSchema),
    defaultValues: existing
      ? {
          type: existing.type,
          displayName: existing.displayName,
          email: existing.email,
          phone: existing.phone,
          notes: existing.notes ?? "",
          tags: existing.tags ?? [],
          address: existing.address ?? {
            street: "",
            city: "",
            zip: "",
            province: "",
            country: "Italia",
          },
          ...(existing.type === "business"
            ? {
                vatNumber: existing.vatNumber,
                sdiCode: existing.sdiCode ?? "",
                pec: existing.pec ?? "",
                taxCode: existing.taxCode ?? "",
              }
            : {
                firstName: existing.firstName,
                lastName: existing.lastName,
                taxCode: existing.taxCode ?? "",
                vatNumber: existing.vatNumber ?? "",
              }),
        }
      : {
          type: "business" as const,
          displayName: "",
          email: "",
          phone: "",
          notes: "",
          tags: [],
          address: {
            street: "",
            city: "",
            zip: "",
            province: "",
            country: "Italia",
          },
          vatNumber: "",
          sdiCode: "",
          pec: "",
          taxCode: "",
        },
  });

  const clientType = useWatch({ control: form.control, name: "type" });

  // Quando cambia tipo, resetta i campi specifici evitando dati residui
  useEffect(() => {
    if (clientType === "business") {
      form.setValue("vatNumber", "");
      form.setValue("sdiCode" as never, "" as never);
      form.setValue("pec" as never, "" as never);
    } else {
      form.setValue("firstName" as never, "" as never);
      form.setValue("lastName" as never, "" as never);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientType]);

  function onSubmit() {
    const rawValues = form.getValues();
    startTransition(async () => {
      const result = existing
        ? await updateClient(existing.id, rawValues, existing.version)
        : await createClient(rawValues);

      if (result.success) {
        toast.success(existing ? "Cliente aggiornato" : "Cliente creato");
        onSuccess?.(existing ? existing.id : (result as { success: true; data: { id: string } }).data.id);
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
        {/* Tipo cliente — solo in creazione */}
        {!existing && (
          <div className="grid grid-cols-2 gap-3">
            {(["business", "individual"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => form.setValue("type", t)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-sm font-medium transition-colors",
                  clientType === t
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:border-border/80 hover:bg-muted/40",
                )}
              >
                {t === "business" ? (
                  <Building2 className="size-5" strokeWidth={1.5} />
                ) : (
                  <User className="size-5" strokeWidth={1.5} />
                )}
                {t === "business" ? "Azienda / Studio" : "Privato"}
              </button>
            ))}
          </div>
        )}

        {/* Ragione sociale / Nome */}
        {clientType === "individual" ? (
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name={"firstName" as keyof FormInput}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input placeholder="Mario" {...field} value={String(field.value ?? "")} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={"lastName" as keyof FormInput}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cognome *</FormLabel>
                  <FormControl>
                    <Input placeholder="Rossi" {...field} value={String(field.value ?? "")} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        ) : null}

        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {clientType === "business" ? "Ragione sociale *" : "Nome visualizzato *"}
              </FormLabel>
              <FormControl>
                <Input
                  placeholder={
                    clientType === "business"
                      ? "Cantina Rossi S.r.l."
                      : "Mario Rossi"
                  }
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Dati fiscali azienda */}
        {clientType === "business" ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name={"vatNumber" as keyof FormInput}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>P.IVA *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="01234567890"
                        maxLength={11}
                        {...field}
                        value={String(field.value ?? "")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={"taxCode" as keyof FormInput}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Codice fiscale</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="uguale alla P.IVA se srl"
                        {...field}
                        value={String(field.value ?? "")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name={"pec" as keyof FormInput}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PEC</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="info@pec.example.com"
                        type="email"
                        {...field}
                        value={String(field.value ?? "")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={"sdiCode" as keyof FormInput}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Codice SDI</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="0000000"
                        maxLength={7}
                        {...field}
                        value={String(field.value ?? "")}
                        onChange={(e) =>
                          field.onChange(e.target.value.toUpperCase())
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </>
        ) : (
          /* Dati fiscali privato */
          <FormField
            control={form.control}
            name={"taxCode" as keyof FormInput}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Codice fiscale</FormLabel>
                <FormControl>
                  <Input
                    placeholder="RSSMRA85T10A562S"
                    maxLength={16}
                    {...field}
                    value={String(field.value ?? "")}
                    onChange={(e) =>
                      field.onChange(e.target.value.toUpperCase())
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <Separator />

        {/* Contatti */}
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Contatti
        </p>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email *</FormLabel>
                <FormControl>
                  <Input placeholder="info@example.com" type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Telefono *</FormLabel>
                <FormControl>
                  <Input placeholder="+39 02 1234567" type="tel" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator />

        {/* Indirizzo */}
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Indirizzo
        </p>
        <FormField
          control={form.control}
          name="address.street"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Via / Indirizzo</FormLabel>
              <FormControl>
                <Input placeholder="Via Roma 1" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-3 gap-3">
          <FormField
            control={form.control}
            name="address.zip"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CAP</FormLabel>
                <FormControl>
                  <Input placeholder="20121" maxLength={5} {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="address.city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Città</FormLabel>
                <FormControl>
                  <Input placeholder="Milano" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="address.province"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prov.</FormLabel>
                <FormControl>
                  <Input
                    placeholder="MI"
                    maxLength={2}
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator />

        {/* Note */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note interne</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Note sul cliente (visibili solo internamente)..."
                  rows={3}
                  className="resize-none"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormDescription>
                Non visibili nei documenti inviati al cliente.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="size-3.5 animate-spin" />}
            {isPending
              ? "Salvataggio..."
              : existing
                ? "Aggiorna cliente"
                : "Crea cliente"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
