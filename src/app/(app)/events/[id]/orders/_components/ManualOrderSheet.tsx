"use client";

import { useState, useTransition, useEffect } from "react";import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";

import { createManualOrder } from "@/server/actions/eventOrders";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const Schema = z.object({
  seats: z.number().int().min(1, "Minimo 1 posto"),
  firstName: z.string().min(1, "Obbligatorio"),
  lastName: z.string().min(1, "Obbligatorio"),
  email: z.string().email("Email non valida"),
  phone: z.string().min(6, "Obbligatorio"),
  participants: z.array(z.object({
    firstName: z.string(),
    lastName: z.string(),
  })),
  totalCents: z.number().int().min(0),
  paymentNote: z.string().min(1, "Specifica il canale (es. Contanti, Bonifico, Telefono)"),
  historyConsent: z.boolean(),
  isFree: z.boolean(),
});

type FormValues = z.infer<typeof Schema>;

interface Props {
  eventId: string;
  eventPriceCents: number;
}

export function ManualOrderSheet({ eventId, eventPriceCents }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      seats: 1,
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      participants: [{ firstName: "", lastName: "" }],
      totalCents: eventPriceCents,
      paymentNote: "",
      historyConsent: false,
      isFree: eventPriceCents === 0,
    },
  });

  const seats = form.watch("seats");
  const isFree = form.watch("isFree");

  // Sincronizza array partecipanti con numero posti
  useEffect(() => {
    const current = form.getValues("participants");
    if (current.length === seats) return;
    const next = Array.from({ length: seats }, (_, i) => current[i] ?? { firstName: "", lastName: "" });
    form.setValue("participants", next);
  }, [seats, form]);

  // Aggiorna totalCents quando cambiano i posti o switch gratuito
  useEffect(() => {
    if (isFree) {
      form.setValue("totalCents", 0);
    } else {
      form.setValue("totalCents", eventPriceCents * (seats || 1));
    }
  }, [seats, isFree, eventPriceCents, form]);

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      // Usa i partecipanti dal form se compilati, altrimenti acquirente come primo
      const participants = values.participants.map((p, i) => ({
        firstName: p.firstName.trim() || (i === 0 ? values.firstName : ""),
        lastName: p.lastName.trim() || (i === 0 ? values.lastName : ""),
      }));

      const result = await createManualOrder(eventId, {
        seats: values.seats,
        buyer: {
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          phone: values.phone,
        },
        participants,
        totalCents: values.isFree ? 0 : values.totalCents,
        paymentNote: values.paymentNote,
        historyConsent: values.historyConsent,
      });

      if (result.success) {
        toast.success(`Prenotazione registrata — ${result.data.orderNumber}`);
        form.reset();
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger>
        <Button size="sm" variant="outline" type="button" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 size-4" strokeWidth={1.75} />
          Registra prenotazione manuale
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Prenotazione manuale</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Per prenotazioni ricevute per telefono, email o di persona.
          </p>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-5">

            {/* Posti */}
            <FormField control={form.control} name="seats" render={({ field }) => (
              <FormItem>
                <FormLabel>Numero di posti *</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 1)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Acquirente */}
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="lastName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cognome *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>Email *</FormLabel>
                <FormControl><Input type="email" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem>
                <FormLabel>Telefono *</FormLabel>
                <FormControl><Input type="tel" placeholder="333 1234567" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Partecipanti (facoltativo) */}
            {seats > 0 && (
              <div className="space-y-3 pt-2 border-t border-border">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Partecipanti <span className="font-normal normal-case">(facoltativo — il primo è pre-compilato con i dati acquirente)</span>
                </p>
                {Array.from({ length: seats }).map((_, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2 bg-muted/30 rounded-lg p-3">
                    <p className="col-span-2 text-xs text-muted-foreground font-medium">Partecipante {i + 1}</p>
                    <Input
                      placeholder="Nome"
                      className="text-sm"
                      {...form.register(`participants.${i}.firstName`)}
                    />
                    <Input
                      placeholder="Cognome"
                      className="text-sm"
                      {...form.register(`participants.${i}.lastName`)}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Pagamento */}
            <div className="space-y-3 pt-2 border-t border-border">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pagamento</p>

              <FormField control={form.control} name="isFree" render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <Label className="cursor-pointer">Prenotazione gratuita / omaggio</Label>
                </FormItem>
              )} />

              {!isFree && (
                <FormField control={form.control} name="totalCents" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Totale incassato (centesimi) *</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                        />
                      </FormControl>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        = {((field.value || 0) / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                      </span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <FormField control={form.control} name="paymentNote" render={({ field }) => (
                <FormItem>
                  <FormLabel>Canale / nota pagamento *</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="Es. Pagato in contanti al telefono / Bonifico ricevuto / Omaggio sponsor"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Consenso storico */}
            <FormField control={form.control} name="historyConsent" render={({ field }) => (
              <FormItem className="flex items-center gap-3">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <Label className="cursor-pointer text-sm text-muted-foreground">
                  Consenso riconoscimento storico acquirente (facoltativo)
                </Label>
              </FormItem>
            )} />

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Registra prenotazione
            </Button>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
