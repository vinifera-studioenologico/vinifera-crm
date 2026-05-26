"use client";

import { useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { z } from "zod";

import { ReminderFormSchema } from "@/schemas/reminder";
import type { ReminderDoc } from "@/schemas/reminder";
import { createReminder, updateReminder } from "@/server/actions/reminders";

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
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

type FormInput = z.input<typeof ReminderFormSchema>;

const REMIND_OPTIONS = [
  { label: "Al momento", value: 0 },
  { label: "15 minuti prima", value: 15 },
  { label: "1 ora prima", value: 60 },
  { label: "1 giorno prima", value: 1440 },
  { label: "3 giorni prima", value: 4320 },
  { label: "1 settimana prima", value: 10080 },
];

function toDatetimeLocal(ts: unknown): string {
  if (!ts) return "";
  const d =
    typeof ts === "object" && ts !== null && "toDate" in ts
      ? (ts as { toDate: () => Date }).toDate()
      : new Date(ts as string);
  // YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  existing?: ReminderDoc;
  defaultRelatedTo?: { kind: "client" | "sample" | "quote" | "payment"; id: string };
  onSuccess?: () => void;
}

export function ReminderForm({ existing, defaultRelatedTo, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();

  const defaultDueAt = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
  })();

  const form = useForm<FormInput>({
    resolver: zodResolver(ReminderFormSchema),
    defaultValues: existing
      ? {
          title: existing.title,
          description: existing.description ?? "",
          dueAt: toDatetimeLocal(existing.dueAt),
          relatedTo: existing.relatedTo ?? undefined,
          remindBeforeMinutes: existing.remindBeforeMinutes ?? 0,
          notifyChannels: existing.notifyChannels,
        }
      : {
          title: "",
          description: "",
          dueAt: defaultDueAt,
          relatedTo: defaultRelatedTo,
          remindBeforeMinutes: 60,
          notifyChannels: { telegram: true, email: false },
        },
    mode: "onTouched",
  });

  function onSubmit() {
    const raw = form.getValues();
    startTransition(async () => {
      const result = existing
        ? await updateReminder(existing.id, raw)
        : await createReminder(raw);

      if (result.success) {
        toast.success(existing ? "Promemoria aggiornato" : "Promemoria creato");
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

  const telegramEnabled = useWatch({ control: form.control, name: "notifyChannels.telegram" });
  const emailEnabled = useWatch({ control: form.control, name: "notifyChannels.email" });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {/* Titolo */}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Titolo *</FormLabel>
              <FormControl>
                <Input placeholder="es. Chiamare cliente per risultati" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Descrizione */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrizione</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Dettagli aggiuntivi..."
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

        {/* Data / ora */}
        <FormField
          control={form.control}
          name="dueAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Data e ora scadenza *</FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Anticipo notifica */}
        <FormField
          control={form.control}
          name="remindBeforeMinutes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Anticipo notifica</FormLabel>
              <FormControl>
                <select
                  className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                  value={String(field.value ?? 0)}
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                >
                  {REMIND_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />

        {/* Canali notifica */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Canali di notifica</p>

          <FormField
            control={form.control}
            name="notifyChannels.telegram"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border px-4 py-2.5">
                <div>
                  <FormLabel>Telegram</FormLabel>
                  <FormDescription className="text-xs">
                    Invia messaggio al bot configurato
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

          <FormField
            control={form.control}
            name="notifyChannels.email"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border px-4 py-2.5">
                <div>
                  <FormLabel>Email</FormLabel>
                  <FormDescription className="text-xs">
                    Invia all&apos;indirizzo configurato nelle impostazioni
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

          {!telegramEnabled && !emailEnabled && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Abilita almeno un canale di notifica per ricevere gli avvisi.
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending && <Loader2 className="size-3.5 animate-spin" />}
          {isPending
            ? existing
              ? "Aggiornamento..."
              : "Creazione..."
            : existing
              ? "Salva modifiche"
              : "Crea promemoria"}
        </Button>
      </form>
    </Form>
  );
}
