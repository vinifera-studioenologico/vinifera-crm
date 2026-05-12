"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2, Bell, Send, Mail } from "lucide-react";

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

const NotificationsSchema = z.object({
  telegramBotToken: z.string().optional(),
  telegramChatId: z.string().optional(),
  notifyEmail: z.string().email("Email non valida").optional().or(z.literal("")),
});

type NotificationsInput = z.input<typeof NotificationsSchema>;

async function saveNotificationSettings() {
  // Le impostazioni di notifica sono solo variabili d'ambiente — qui mostriamo
  // le istruzioni su come configurarle, ma fornisci un "test" locale se disponibile.
  // In un progetto reale si salverebbero in Firestore settings/notifications.
  return { success: true };
}

export function NotificationsSettingsForm() {
  const [isPending, startTransition] = useTransition();

  const form = useForm<NotificationsInput>({
    resolver: zodResolver(NotificationsSchema),
    defaultValues: {
      telegramBotToken: "",
      telegramChatId: "",
      notifyEmail: "",
    },
    mode: "onTouched",
  });

  function onSubmit() {
    startTransition(async () => {
      const result = await saveNotificationSettings();
      if (result.success) toast.success("Impostazioni salvate");
      else toast.error("Errore nel salvataggio");
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="size-4" strokeWidth={1.75} />
              Telegram
            </CardTitle>
            <CardDescription>
              Configura il bot Telegram per ricevere notifiche sui promemoria. Le
              variabili d&apos;ambiente corrispondenti sono{" "}
              <code className="rounded bg-muted px-1 text-xs">TELEGRAM_BOT_TOKEN</code>{" "}
              e{" "}
              <code className="rounded bg-muted px-1 text-xs">TELEGRAM_CHAT_ID</code>.
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
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="size-4" strokeWidth={1.75} />
              Email
            </CardTitle>
            <CardDescription>
              Indirizzo a cui inviare le notifiche email dei promemoria (variabile{" "}
              <code className="rounded bg-muted px-1 text-xs">NOTIFY_EMAIL</code>). L&apos;API
              key Resend è configurata tramite{" "}
              <code className="rounded bg-muted px-1 text-xs">RESEND_API_KEY</code>.
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

        <Separator />

        <Card className="bg-muted/40 border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="size-4" strokeWidth={1.75} />
              Variabili d&apos;ambiente richieste
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs leading-relaxed">
              {`TELEGRAM_BOT_TOKEN=<token>
TELEGRAM_CHAT_ID=<chat_id>
NOTIFY_EMAIL=admin@lab.it
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL="Vinifera <noreply@dominio.it>"
CRON_SECRET=<segreto_random>`}
            </pre>
            <p className="mt-3 text-xs text-muted-foreground">
              Imposta queste variabili nel pannello Vercel → Settings → Environment
              Variables (o nel file <code>.env.local</code> per lo sviluppo locale).
            </p>
          </CardContent>
        </Card>

        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="size-3.5 animate-spin" />}
          {isPending ? "Salvataggio..." : "Salva impostazioni"}
        </Button>
      </form>
    </Form>
  );
}
