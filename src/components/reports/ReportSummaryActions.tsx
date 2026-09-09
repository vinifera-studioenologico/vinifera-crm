"use client";

import { useState, useTransition } from "react";
import { Download, Mail, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { ReportSummaryDoc } from "@/schemas/reportSummary";
import { sendReportSummaryByEmail } from "@/server/actions/reportSummaries";
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

interface Props {
  summary: ReportSummaryDoc;
  className?: string;
}

/**
 * Pulsanti azione per un referto riepilogativo — invia via email, condividi
 * su WhatsApp, scarica PDF. A differenza di ReportActions non c'è un picker
 * tecnico/commerciale: il riepilogo esiste solo in versione commerciale
 * (con i totali).
 */
export function ReportSummaryActions({ summary, className }: Props) {
  const [isWhatsApp, setIsWhatsApp] = useState(false);
  const pdfUrl = `/api/pdf/report-summary/${summary.id}`;

  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [isSending, startSend] = useTransition();

  function openEmail() {
    setEmailTo(summary.clientSnapshot.email ?? "");
    setEmailSubject(`Referto riepilogativo ${summary.number} — ${summary.clientSnapshot.displayName}`);
    setEmailBody(`Gentile cliente,\n\nin allegato il referto riepilogativo ${summary.number}.\n\nCordiali saluti`);
    setEmailOpen(true);
  }

  function handleWhatsApp() {
    const clientSlug = summary.clientSnapshot.displayName.replace(/\s+/g, '_').replace(/[/\\:*?"<>|]/g, '');
    const filename = `referto-riepilogativo-${summary.number}_${clientSlug}.pdf`;
    setIsWhatsApp(true);
    sharePdf(pdfUrl, filename)
      .then((result) => {
        if (result === "downloaded")
          toast.info("PDF scaricato — allegalo su WhatsApp manualmente");
        else if (result === "error")
          toast.error("Errore durante la generazione del PDF");
      })
      .finally(() => setIsWhatsApp(false));
  }

  function handleSend() {
    startSend(async () => {
      const result = await sendReportSummaryByEmail(summary.id, {
        to: emailTo,
        subject: emailSubject,
        body: emailBody,
      });
      if (result.success) {
        toast.success("Referto riepilogativo inviato via email");
        setEmailOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className={className ?? "flex justify-end gap-1"}>
        <Button variant="ghost" size="icon" aria-label="Invia via email" onClick={openEmail}>
          <Mail className="size-3.5" strokeWidth={1.75} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Condividi su WhatsApp"
          disabled={isWhatsApp}
          onClick={handleWhatsApp}
        >
          <WhatsAppIcon className="size-3.5" />
        </Button>
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="icon" aria-label="Scarica PDF">
            <Download className="size-3.5" strokeWidth={1.75} />
          </Button>
        </a>
      </div>

      {/* Dialog invio email */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invia referto riepilogativo via email</DialogTitle>
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
              <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
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
