"use client";

import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Paperclip, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";

import { SupportFormSchema, type SupportFormValues } from "@/schemas/support";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const ERROR_MESSAGES: Record<string, string> = {
  rate_limit_exceeded: "Troppi invii in poco tempo. Riprova più tardi.",
  support_disabled: "Il supporto non è al momento disponibile.",
  support_not_configured: "Servizio di supporto non configurato.",
  network_error: "Errore di rete. Verifica la connessione e riprova.",
};

interface SupportFormProps {
  defaultName?: string;
  defaultEmail?: string;
  defaultPhone?: string;
}

export function SupportForm({ defaultName = "", defaultEmail = "", defaultPhone = "" }: SupportFormProps) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<SupportFormValues>({
    resolver: zodResolver(SupportFormSchema),
    defaultValues: {
      name: defaultName,
      email: defaultEmail,
      phone: defaultPhone,
      subject: "",
      message: "",
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const added = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...added]);
    // reset input so same file can be re-added after removal
    e.target.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function onSubmit(values: SupportFormValues) {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("name", values.name);
      fd.append("email", values.email);
      if (values.phone) fd.append("phone", values.phone);
      fd.append("subject", values.subject);
      fd.append("message", values.message);
      files.forEach((f) => fd.append("attachments", f));

      try {
        const res = await fetch("/api/support", {
          method: "POST",
          body: fd,
        });

        if (res.ok) {
          setSubmitted(true);
          form.reset();
          setFiles([]);
          return;
        }

        let errCode = "unknown_error";
        try {
          const json = (await res.json()) as { error?: string };
          errCode = json.error ?? errCode;
        } catch {
          // ignore parse errors
        }

        const message =
          ERROR_MESSAGES[errCode] ??
          "Si è verificato un errore. Riprova più tardi.";
        toast.error(message);
      } catch {
        toast.error("Errore di rete. Verifica la connessione e riprova.");
      }
    });
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <CheckCircle2 className="size-14 text-emerald-500" strokeWidth={1.5} />
        <div>
          <p className="text-lg font-semibold">Richiesta inviata!</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ti risponderemo il prima possibile all&apos;indirizzo indicato.
          </p>
        </div>
        <Button variant="outline" onClick={() => setSubmitted(false)}>
          Invia un&apos;altra richiesta
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-5"
        noValidate
      >
        {/* Nome + Email */}
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome e cognome *</FormLabel>
                <FormControl>
                  <Input placeholder="Mario Rossi" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email *</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="mario@esempio.it"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Telefono */}
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Telefono</FormLabel>
              <FormControl>
                <Input
                  type="tel"
                  placeholder="+39 333 1234567"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Oggetto */}
        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Oggetto *</FormLabel>
              <FormControl>
                <Input placeholder="Descrivi brevemente il problema" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Messaggio */}
        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Messaggio *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Descrivi il problema in dettaglio..."
                  rows={6}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Allegati */}
        <div className="space-y-2">
          <span className="text-sm font-medium leading-none">Allegati</span>

          {files.length > 0 && (
            <ul className="space-y-1.5">
              {files.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm"
                >
                  <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    aria-label={`Rimuovi ${f.name}`}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="size-4" />
            Aggiungi allegato
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
            onChange={handleFileChange}
          />
        </div>

        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending && <Loader2 className="size-4 animate-spin" />}
          {isPending ? "Invio in corso…" : "Invia richiesta"}
        </Button>
      </form>
    </Form>
  );
}
