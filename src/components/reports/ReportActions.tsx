"use client";

import { useState, useTransition } from "react";
import { Download, Mail, Send, Loader2, FlaskConical, Receipt } from "lucide-react";
import { toast } from "sonner";

import type { ReportDoc } from "@/schemas/report";
import { sendReportByEmail } from "@/server/actions/reports";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { sharePdf } from "@/lib/utils/share";
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

type PdfType = "technical" | "commercial";
type PickerAction = "download" | "email" | "whatsapp";

interface Props {
  report: ReportDoc;
  /** Override delle classi del contenitore dei pulsanti (default: allineati a destra). */
  className?: string;
}

/**
 * Pulsanti azione per un referto — invia via email, condividi su WhatsApp,
 * scarica PDF — con dialog di scelta tecnico/commerciale e dialog di invio
 * email. Condiviso tra la lista referti globale (/reports) e lo storico
 * referti nel dettaglio cliente.
 */
export function ReportActions({ report, className }: Props) {
  // Picker tipo PDF
  const [pickerAction, setPickerAction] = useState<PickerAction | null>(null);
  const [isWhatsApp, setIsWhatsApp] = useState(false);

  // Email
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailType, setEmailType] = useState<PdfType>("technical");
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [isSending, startSend] = useTransition();

  function handlePickType(type: PdfType) {
    if (pickerAction === "download") {
      const url = type === "commercial"
        ? `/api/pdf/report/${report.id}?type=commercial`
        : `/api/pdf/report/${report.id}`;
      window.open(url, "_blank");
      setPickerAction(null);
    } else if (pickerAction === "whatsapp") {
      const clientSlug = report.clientSnapshot.displayName.replace(/\s+/g, '_').replace(/[/\\:*?"<>|]/g, '');
      const filename = type === "commercial"
        ? `referto-commerciale-${report.number}_${clientSlug}.pdf`
        : `referto-${report.number}_${clientSlug}.pdf`;
      const pdfUrl = type === "commercial"
        ? `/api/pdf/report/${report.id}?type=commercial`
        : `/api/pdf/report/${report.id}`;
      setPickerAction(null);
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
      setEmailTo(report.clientSnapshot.email ?? "");
      setEmailSubject(`Referto ${report.number} — ${report.clientSnapshot.displayName}`);
      setEmailBody(`Gentile cliente,\n\nin allegato il referto ${report.number}.\n\nCordiali saluti`);
      setPickerAction(null);
      setEmailOpen(true);
    }
  }

  function handleSend() {
    startSend(async () => {
      const result = await sendReportByEmail(report.id, {
        to: emailTo,
        subject: emailSubject,
        body: emailBody,
        type: emailType,
      });
      if (result.success) {
        toast.success("Referto inviato via email");
        setEmailOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className={className ?? "flex justify-end gap-1"}>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Invia via email"
          onClick={() => setPickerAction("email")}
        >
          <Mail className="size-3.5" strokeWidth={1.75} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Condividi su WhatsApp"
          disabled={isWhatsApp}
          onClick={() => setPickerAction("whatsapp")}
        >
          <WhatsAppIcon className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Scarica PDF"
          onClick={() => setPickerAction("download")}
        >
          <Download className="size-3.5" strokeWidth={1.75} />
        </Button>
      </div>

      {/* Dialog picker tipo PDF */}
      <Dialog open={!!pickerAction} onOpenChange={(open) => !open && setPickerAction(null)}>
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
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
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
            <Button variant="outline" onClick={() => setEmailOpen(false)}>
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
    </>
  );
}
