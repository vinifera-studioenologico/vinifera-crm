"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2, Send, Mail, FlaskConical } from "lucide-react";

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
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  sendTestTelegram,
  sendTestEmail,
  updateNotificationSettings,
} from "@/server/actions/settings";
import type { NotificationSettingsValues } from "@/schemas/settings";

const WARNING_DAYS_OPTIONS = [
  { value: 0, label: "Disabilitato" },
  { value: 1, label: "1 giorno prima" },
  { value: 2, label: "2 giorni prima" },
  { value: 3, label: "3 giorni prima" },
  { value: 5, label: "5 giorni prima" },
  { value: 7, label: "1 settimana prima" },
  { value: 14, label: "2 settimane prima" },
  { value: 30, label: "30 giorni prima" },
];

const NotificationsSchema = z.object({
  telegramBotToken: z.string().default(""),
  telegramChatId: z.string().default(""),
  notifyEmail: z.string().email("Email non valida").or(z.literal("")).default(""),
  installmentWarningDays: z.coerce.number().int().min(0).max(30).default(3),
});

type NotificationsInput = z.input<typeof NotificationsSchema>;

interface Props {
  initialValues: NotificationSettingsValues;
}

export function NotificationsSettingsForm({ initialValues }: Props) {
  const [isPending, startTransition] = useTransition();
  const [isTelegramTestPending, startTelegramTest] = useTransition();
  const [isEmailTestPending, startEmailTest] = useTransition();

  const form = useForm<NotificationsInput>({
    resolver: zodResolver(NotificationsSchema),
    defaultValues: {
      telegramBotToken: initialValues.telegramBotToken,
      telegramChatId: initialValues.telegramChatId,
      notifyEmail: initialValues.notifyEmail,
      installmentWarningDays: initialValues.installmentWarningDays,
    },
    mode: "onTouched",
  });

  function onSubmit(values: NotificationsInput) {
    startTransition(async () => {
      const result = await updateNotificationSettings(values);
      if (result.success) toast.success("Impostazioni salvate");
      else toast.error(result.error ?? "Errore nel salvataggio");
    });
  }

  function handleTestTelegram() {
    startTelegramTest(async () => {
      const result = await sendTestTelegram();
      if (result.success) toast.success("Messaggio Telegram inviato con successo!");
      else toast.error(result.error ?? "Errore nell'invio Telegram");
    });
  }

  function handleTestEmail() {
    startEmailTest(async () => {
      const result = await sendTestEmail();
      if (result.success) toast.success("Email di test inviata con successo!");
      else toast.error(result.error ?? "Errore nell'invio email");
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Send className="size-4" strokeWidth={1.75} />
                Telegram
              </CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isTelegramTestPending}
                onClick={handleTestTelegram}
              >
                {isTelegramTestPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FlaskConical className="size-3.5" />
                )}
                Invia test
              </Button>
            </div>
            <CardDescription>
              Configura il bot Telegram per ricevere notifiche sui promemoria.
              Ottieni il token da{" "}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                @BotFather
              </a>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="telegramBotToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bot Token</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="123456789:AAF..."
                      type="password"
                      autoComplete="off"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>
                    Visibile una sola volta su @BotFather — incollalo qui e salva.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="telegramChatId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chat ID</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="-100123456789"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>
                    ID del canale o della chat personale dove inviare i messaggi.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="size-4" strokeWidth={1.75} />
                Email
              </CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isEmailTestPending}
                onClick={handleTestEmail}
              >
                {isEmailTestPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FlaskConical className="size-3.5" />
                )}
                Invia test
              </Button>
            </div>
            <CardDescription>
              Indirizzo a cui inviare le notifiche email dei promemoria. L&apos;invio
              avviene tramite Resend (API key configurata nelle variabili d&apos;ambiente).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="notifyEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email notifiche</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="admin@lab.it"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span>💶</span>
              Rate
            </CardTitle>
            <CardDescription>
              Avviso anticipato quando una rata si avvicina alla scadenza. Il canale usato
              è lo stesso configurato sopra (Telegram + Email).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="installmentWarningDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Avvisa prima della scadenza</FormLabel>
                  <FormControl>
                    <select
                      className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                      value={String(field.value ?? 3)}
                      onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                    >
                      {WARNING_DAYS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormDescription className="text-xs">
                    Invia anche una notifica quando una rata diventa scaduta (status overdue),
                    indipendentemente da questa impostazione.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Separator />

        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="size-3.5 animate-spin" />}
          {isPending ? "Salvataggio..." : "Salva impostazioni"}
        </Button>
      </form>
    </Form>
  );
}
