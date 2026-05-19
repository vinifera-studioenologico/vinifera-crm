"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Loader2,
  Download,
  Send,
  CheckSquare2,
  Square,
  FileText,
  FlaskConical,
  Receipt,
} from "lucide-react";
import type { z } from "zod";

import { ReportFormSchema } from "@/schemas/report";
import type { SampleDoc } from "@/schemas/sample";
import type { ClientDoc } from "@/schemas/client";
import { createReport, sendReportByEmail } from "@/server/actions/reports";
import { formatDate } from "@/lib/utils/date";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { SampleStatusBadge } from "@/components/widgets/SampleStatusBadge";

type FormInput = z.input<typeof ReportFormSchema>;

interface Props {
  clients: ClientDoc[];
  completedSamples: SampleDoc[];
}

export function NewReportForm({ clients, completedSamples }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createdNumber, setCreatedNumber] = useState<string | null>(null);
  const [sendMode, setSendMode] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [isSending, startSend] = useTransition();
  const [pdfType, setPdfType] = useState<"technical" | "commercial">("technical");

  const form = useForm<FormInput>({
    resolver: zodResolver(ReportFormSchema),
    defaultValues: {
      clientId: "",
      sampleIds: [],
      notes: "",
    },
    mode: "onTouched",
  });

  const selectedClientId = useWatch({ control: form.control, name: "clientId" });
  const selectedSampleIds = useWatch({ control: form.control, name: "sampleIds" });

  // Filtra campioni completati del cliente selezionato
  const clientSamples = completedSamples.filter(
    (s) => s.clientId === selectedClientId,
  );

  function toggleSample(id: string) {
    const current = form.getValues("sampleIds");
    if (current.includes(id)) {
      form.setValue(
        "sampleIds",
        current.filter((x) => x !== id),
        { shouldValidate: true },
      );
    } else {
      form.setValue("sampleIds", [...current, id], { shouldValidate: true });
    }
  }

  // Quando il cliente cambia, deseleziona tutti i campioni
  function handleClientChange(clientId: string) {
    form.setValue("clientId", clientId);
    form.setValue("sampleIds", []);
  }

  function onSubmit() {
    const raw = form.getValues();
    startTransition(async () => {
      const result = await createReport(raw);
      if (result.success) {
        setCreatedId(result.data.id);
        setCreatedNumber(result.data.number);

        // Pre-compila l'email
        const client = clients.find((c) => c.id === raw.clientId);
        const clientEmail = client && "email" in client ? (client.email ?? "") : "";
        setEmailTo(clientEmail);
        setEmailSubject(
          `Referto ${result.data.number} — ${client?.displayName ?? ""}`,
        );
        setEmailBody(
          `Gentile cliente,\n\nin allegato il referto ${result.data.number}.\n\nCordiali saluti`,
        );

        toast.success(`Referto ${result.data.number} generato`);
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleSend() {
    if (!createdId) return;
    startSend(async () => {
      const result = await sendReportByEmail(createdId, {
        to: emailTo,
        subject: emailSubject,
        body: emailBody,
        type: pdfType,
      });
      if (result.success) {
        toast.success("Referto inviato via email");
        setSendMode(false);
        router.push(`/reports`);
      } else {
        toast.error(result.error);
      }
    });
  }

  // ── Dopo la generazione: download + invio ─────────────────────────
  if (createdId && createdNumber) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-6 text-center space-y-2">
          <FileText className="size-8 mx-auto text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
          <p className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
            Referto {createdNumber} generato
          </p>
        </div>

        {/* Selettore tipo PDF */}
        <div className="grid grid-cols-2 gap-3">
          {([
            { value: "technical", label: "Tecnico", desc: "Solo risultati", Icon: FlaskConical },
            { value: "commercial", label: "Commerciale", desc: "Con prezzi", Icon: Receipt },
          ] as const).map(({ value, label, desc, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPdfType(value)}
              className={`flex flex-col items-center gap-1.5 rounded-lg border p-4 text-sm transition-colors ${
                pdfType === value
                  ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300"
                  : "border-border hover:bg-muted text-muted-foreground"
              }`}
            >
              <Icon className="size-5" strokeWidth={1.5} />
              <span className="font-medium">{label}</span>
              <span className="text-xs opacity-70">{desc}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <a
            href={`/api/pdf/report/${createdId}${pdfType === "commercial" ? "?type=commercial" : ""}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" className="w-full">
              <Download className="size-3.5" strokeWidth={1.75} />
              Scarica PDF
            </Button>
          </a>

          <Button
            variant="default"
            className="w-full"
            onClick={() => setSendMode(!sendMode)}
          >
            <Send className="size-3.5" strokeWidth={1.75} />
            Invia via email
          </Button>
        </div>

        {sendMode && (
          <div className="space-y-4 pt-2">
            <Separator />
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>A (email)</Label>
                <Input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="cliente@email.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Oggetto</Label>
                <Input
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Corpo messaggio</Label>
                <Textarea
                  rows={4}
                  className="resize-none"
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                />
              </div>
            </div>
            <Button
              className="w-full"
              disabled={isSending || !emailTo}
              onClick={handleSend}
            >
              {isSending && <Loader2 className="size-3.5 animate-spin" />}
              {isSending ? "Invio..." : "Invia"}
            </Button>
          </div>
        )}

        <Button
          variant="ghost"
          className="w-full text-muted-foreground"
          onClick={() => router.push("/reports")}
        >
          Torna ai referti
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {/* Cliente */}
        <FormField
          control={form.control}
          name="clientId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cliente *</FormLabel>
              <FormControl>
                <select
                  className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                  value={field.value}
                  onChange={(e) => handleClientChange(e.target.value)}
                >
                  <option value="">— Seleziona cliente —</option>
                  {clients
                    .filter((c) => c.deletedAt === null)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.displayName}
                      </option>
                    ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Campioni */}
        {selectedClientId && (
          <FormField
            control={form.control}
            name="sampleIds"
            render={() => (
              <FormItem>
                <FormLabel>Campioni completati *</FormLabel>
                {clientSamples.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    Nessun campione completato per questo cliente.
                  </p>
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                    {clientSamples.map((sample) => {
                      const isSelected = selectedSampleIds.includes(sample.id);
                      return (
                        <button
                          key={sample.id}
                          type="button"
                          onClick={() => toggleSample(sample.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                            isSelected ? "bg-primary/5" : "hover:bg-muted/40"
                          }`}
                        >
                          {isSelected ? (
                            <CheckSquare2
                              className="size-4 text-primary shrink-0"
                              strokeWidth={1.75}
                            />
                          ) : (
                            <Square
                              className="size-4 text-muted-foreground shrink-0"
                              strokeWidth={1.75}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">
                                {sample.code}
                              </span>
                              <SampleStatusBadge status={sample.status} />
                            </div>
                            <p className="text-sm font-medium truncate">
                              {sample.sampleName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {sample.items.length} analisi ·{" "}
                              {sample.receivedAt
                                ? formatDate(
                                    sample.receivedAt as Parameters<typeof formatDate>[0],
                                  )
                                : "—"}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedSampleIds.length > 0 && (
                  <FormDescription>
                    {selectedSampleIds.length} campion
                    {selectedSampleIds.length === 1 ? "e" : "i"} selezionat
                    {selectedSampleIds.length === 1 ? "o" : "i"}
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Note */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note aggiuntive</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Note da includere nel referto..."
                  rows={3}
                  className="resize-none"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full"
          disabled={isPending || selectedSampleIds.length === 0}
        >
          {isPending && <Loader2 className="size-3.5 animate-spin" />}
          {isPending ? "Generazione PDF..." : "Genera referto"}
        </Button>
      </form>
    </Form>
  );
}
