"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, FileText, Download, Mail, Send, Loader2, FlaskConical, Receipt } from "lucide-react";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";

import type { ReportDoc } from "@/schemas/report";
import { sendReportByEmail } from "@/server/actions/reports";
import { formatDate } from "@/lib/utils/date";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { sharePdf } from "@/lib/utils/share";
import { DataTable } from "@/components/data-table/DataTable";
import { CsvExportButton } from "@/components/data-table/CsvExportButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

type PdfType = "technical" | "commercial";
type PickerAction = "download" | "email" | "whatsapp";

interface Props {
  initialData: ReportDoc[];
}

export function ReportsClient({ initialData }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  // Picker tipo PDF
  const [pickerTarget, setPickerTarget] = useState<ReportDoc | null>(null);
  const [pickerAction, setPickerAction] = useState<PickerAction>("download");

  // Email
  const [emailTarget, setEmailTarget] = useState<ReportDoc | null>(null);
  const [emailType, setEmailType] = useState<PdfType>("technical");
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [isSending, startSend] = useTransition();
  const [isWhatsApp, setIsWhatsApp] = useState(false);

  function openPicker(report: ReportDoc, action: PickerAction) {
    setPickerTarget(report);
    setPickerAction(action);
  }

  function handlePickType(type: PdfType) {
    if (!pickerTarget) return;
    if (pickerAction === "download") {
      const url = type === "commercial"
        ? `/api/pdf/report/${pickerTarget.id}?type=commercial`
        : `/api/pdf/report/${pickerTarget.id}`;
      window.open(url, "_blank");
      setPickerTarget(null);
    } else if (pickerAction === "whatsapp") {
      const target = pickerTarget;
      const clientSlug = target.clientSnapshot.displayName.replace(/\s+/g, '_').replace(/[/\\:*?"<>|]/g, '');
      const filename = type === "commercial"
        ? `referto-commerciale-${target.number}_${clientSlug}.pdf`
        : `referto-${target.number}_${clientSlug}.pdf`;
      const pdfUrl = type === "commercial"
        ? `/api/pdf/report/${target.id}?type=commercial`
        : `/api/pdf/report/${target.id}`;
      setPickerTarget(null);
      setIsWhatsApp(true);
      sharePdf(pdfUrl, filename)
        .then((result) => {
          if (result === "downloaded")
            toast.info("PDF scaricato — allegalo su WhatsApp manualmente");
          else if (result === "error")
            toast.error("Errore durante la generazione del PDF");
        })
        .finally(() => setIsWhatsApp(false));
    } else {
      // email
      setEmailType(type);
      setEmailTarget(pickerTarget);
      setEmailTo(pickerTarget.clientSnapshot.email ?? "");
      setEmailSubject(`Referto ${pickerTarget.number} — ${pickerTarget.clientSnapshot.displayName}`);
      setEmailBody(`Gentile cliente,\n\nin allegato il referto ${pickerTarget.number}.\n\nCordiali saluti`);
      setPickerTarget(null);
    }
  }

  function handleSend() {
    if (!emailTarget) return;
    startSend(async () => {
      const result = await sendReportByEmail(emailTarget.id, {
        to: emailTo,
        subject: emailSubject,
        body: emailBody,
        type: emailType,
      });
      if (result.success) {
        toast.success("Referto inviato via email");
        setEmailTarget(null);
      } else {
        toast.error(result.error);
      }
    });
  }

  const filtered = initialData.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.number.toLowerCase().includes(q) ||
      r.clientSnapshot.displayName.toLowerCase().includes(q)
    );
  });

  const columns: ColumnDef<ReportDoc>[] = [
    {
      accessorKey: "number",
      header: "Numero",
      size: 130,
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.original.number}</span>
      ),
    },
    {
      id: "client",
      header: "Cliente",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.clientSnapshot.displayName}</p>
          {row.original.clientSnapshot.email && (
            <p className="text-xs text-muted-foreground">
              {row.original.clientSnapshot.email}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "samples",
      header: "Campioni",
      size: 90,
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">{row.original.sampleIds.length}</span>
      ),
    },
    {
      id: "generatedAt",
      header: "Generato il",
      size: 130,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.generatedAt
            ? formatDate(row.original.generatedAt as Parameters<typeof formatDate>[0])
            : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      size: 100,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Invia via email"
            onClick={() => openPicker(row.original, "email")}
          >
            <Mail className="size-3.5" strokeWidth={1.75} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Condividi su WhatsApp"
            disabled={isWhatsApp}
            onClick={() => openPicker(row.original, "whatsapp")}
          >
            <WhatsAppIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Scarica PDF"
            onClick={() => openPicker(row.original, "download")}
          >
            <Download className="size-3.5" strokeWidth={1.75} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="min-w-0">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Referti</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Referti
          </h1>
        </div>
        <Button onClick={() => router.push("/reports/new")} className="w-full md:w-auto">
          <Plus className="size-3.5" strokeWidth={1.75} />
          Nuovo referto
        </Button>
      </div>

      {/* Ricerca */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Cerca per numero o cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <CsvExportButton
          data={filtered}
          columns={[
            { header: "Numero", accessor: (r: ReportDoc) => r.number },
            { header: "Cliente", accessor: (r: ReportDoc) => r.clientSnapshot.displayName },
            { header: "Email cliente", accessor: (r: ReportDoc) => r.clientSnapshot.email ?? "" },
            { header: "N. campioni", accessor: (r: ReportDoc) => String(r.sampleIds.length) },
            { header: "Generato il", accessor: (r: ReportDoc) => r.generatedAt ? formatDate(r.generatedAt as Parameters<typeof formatDate>[0]) : "" },
          ]}
          filenamePrefix="referti"
        />
      </div>

      {/* Tabella / empty */}
      {filtered.length === 0 && !search ? (
        <div className="rounded-xl border border-border bg-card p-16 flex flex-col items-center gap-3 text-center">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center">
            <FileText className="size-5 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-foreground">Nessun referto</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Genera il primo referto selezionando i campioni completati.
          </p>
          <Button size="sm" onClick={() => router.push("/reports/new")}>
            Nuovo referto
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          globalFilter={search}
          emptyMessage="Nessun referto trovato."
        />
      )}

      {/* Dialog picker tipo PDF */}
      <Dialog open={!!pickerTarget} onOpenChange={(open) => !open && setPickerTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {pickerAction === "download" ? "Scarica PDF" : pickerAction === "whatsapp" ? "Condividi su WhatsApp" : "Invia via email"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            Scegli la versione del referto da {pickerAction === "download" ? "scaricare" : pickerAction === "whatsapp" ? "condividere" : "inviare"}.
          </p>
          <div className="grid grid-cols-2 gap-3 py-2">
            <button
              onClick={() => handlePickType("technical")}
              className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 hover:border-primary hover:bg-primary/5 transition-colors text-left"
            >
              <FlaskConical className="size-6 text-muted-foreground" strokeWidth={1.5} />
              <div>
                <p className="text-sm font-medium">Tecnico</p>
                <p className="text-xs text-muted-foreground">Risultati analisi, senza prezzi</p>
              </div>
            </button>
            <button
              onClick={() => handlePickType("commercial")}
              className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 hover:border-primary hover:bg-primary/5 transition-colors text-left"
            >
              <Receipt className="size-6 text-muted-foreground" strokeWidth={1.5} />
              <div>
                <p className="text-sm font-medium">Commerciale</p>
                <p className="text-xs text-muted-foreground">Con prezzi, totale e firme</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog invio email */}
      <Dialog open={!!emailTarget} onOpenChange={(open) => !open && setEmailTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invia referto via email</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailTarget(null)}>
              Annulla
            </Button>
            <Button disabled={isSending || !emailTo} onClick={handleSend}>
              {isSending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" strokeWidth={1.75} />
              )}
              {isSending ? "Invio..." : "Invia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
