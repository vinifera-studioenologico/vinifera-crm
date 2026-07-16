"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Send } from "lucide-react";

import type { EventDoc } from "@/schemas/event";
import { publishEvent, unpublishEvent, cancelEventWithRefunds, notifyAllBuyers } from "@/server/actions/events";
import { derivePublicStatus, isFreeEvent, seatsAvailable } from "@/lib/events/status";
import { formatEUR } from "@/lib/utils/money";
import { EventForm } from "../../_components/EventForm";
import { EventStatusBadge } from "../../_components/EventStatusBadge";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  event: EventDoc;
}

export function EventDetailClient({ event }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false);
  const [notifySubject, setNotifySubject] = useState("");
  const [notifyBody, setNotifyBody] = useState("");

  const publicStatus = derivePublicStatus(
    {
      status: event.status,
      startsAt: new Date(event.startsAt as string),
      endsAt: event.endsAt ? new Date(event.endsAt as string) : null,
      bookingOpensAt: event.bookingOpensAt ? new Date(event.bookingOpensAt as string) : null,
      bookingClosesAt: event.bookingClosesAt ? new Date(event.bookingClosesAt as string) : null,
      capacity: event.capacity,
      seatsSold: event.seatsSold,
      seatsHeld: event.seatsHeld,
    },
    new Date(),
  );

  const isOverbooked = seatsAvailable(event) < 0;
  const isArchived = event.deletedAt !== null;

  function handlePublish() {
    startTransition(async () => {
      const result = await publishEvent(event.id);
      if (result.success) {
        toast.success("Evento pubblicato");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleUnpublish() {
    startTransition(async () => {
      const result = await unpublishEvent(event.id);
      if (result.success) {
        toast.success("Evento nascosto (bozza)");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelEventWithRefunds(event.id);
      if (result.success) {
        const { paidCount, freeCount, errors } = result.data;
        const msg = [
          paidCount > 0 ? `${paidCount} rimborso/i Stripe avviato/i` : null,
          freeCount > 0 ? `${freeCount} prenotazione/i gratuita/e annullata/e` : null,
          errors.length > 0 ? `${errors.length} errore/i: ${errors[0]}` : null,
        ].filter(Boolean).join(". ");
        toast.success(`Evento cancellato. ${msg}`);
        setCancelDialogOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
        setCancelDialogOpen(false);
      }
    });
  }

  function handleNotifyAll() {
    startTransition(async () => {
      const result = await notifyAllBuyers(event.id, notifySubject, notifyBody);
      if (result.success) {
        toast.success(`Email inviata a ${result.data.sent} acquirente/i`);
        setNotifyDialogOpen(false);
        setNotifySubject("");
        setNotifyBody("");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      {/* Notifica tutti gli acquirenti */}
      {event.status !== "cancelled" && event.seatsSold > 0 && (
        <div className="border border-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Send className="size-4" strokeWidth={1.75} />
            Notifica tutti gli acquirenti
          </h3>
          <p className="text-xs text-muted-foreground">
            Invia un messaggio a tutti gli acquirenti con ordine confermato (dedup per email).
          </p>
          <Button size="sm" variant="outline" onClick={() => setNotifyDialogOpen(true)}>
            Componi messaggio
          </Button>
        </div>
      )}

      {/* Header azioni */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Badge stato */}
        <EventStatusBadge status={publicStatus ?? event.status} />

        {/* Azioni */}
        {!isArchived && event.status !== "cancelled" && (
          <>
            {event.status === "draft" ? (
              <Button size="sm" onClick={handlePublish} disabled={isPending}>
                {isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Pubblica
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={handleUnpublish} disabled={isPending}>
                Nascondi
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive ml-auto"
              onClick={() => setCancelDialogOpen(true)}
              disabled={isPending}
            >
              Cancella evento
            </Button>
          </>
        )}
      </div>

      {/* Overbooking alert */}
      {isOverbooked && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            ⚠️ Overbooking: {Math.abs(seatsAvailable(event))} posto/i in eccedenza. Le nuove
            prenotazioni sono bloccate automaticamente.
          </AlertDescription>
        </Alert>
      )}

      {/* Riepilogo rapido */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="text-xs text-muted-foreground mb-0.5">Venduti</div>
          <div className="font-semibold tabular-nums">{event.seatsSold}/{event.capacity}</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="text-xs text-muted-foreground mb-0.5">In hold</div>
          <div className="font-semibold tabular-nums">{event.seatsHeld}</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="text-xs text-muted-foreground mb-0.5">Prezzo</div>
          <div className="font-semibold">
            {isFreeEvent(event) ? (
              <span className="text-green-700 dark:text-green-400">Gratuito</span>
            ) : (
              formatEUR(event.discountedPriceCents ?? event.priceCents)
            )}
          </div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="text-xs text-muted-foreground mb-0.5">Incasso netto</div>
          <div className="font-semibold tabular-nums">
            {formatEUR(event.seatsSold * (event.discountedPriceCents ?? event.priceCents))}
          </div>
        </div>
      </div>

      {/* Form modifica */}
      <EventForm existing={event} />

      {/* Dialog conferma cancellazione */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancella evento con rimborsi</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler cancellare <strong>{event.title?.it || event.slug}</strong>?
              <br /><br />
              Gli ordini pagati riceveranno un rimborso Stripe automatico.
              Le prenotazioni gratuite saranno annullate direttamente.
              L&apos;evento sparirà dal sito immediatamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={isPending}
            >
              {isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Sì, cancella con rimborsi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog "Notifica tutti" */}
      <Dialog open={notifyDialogOpen} onOpenChange={setNotifyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notifica tutti gli acquirenti</DialogTitle>
            <DialogDescription>
              Il messaggio verrà inviato a tutti gli acquirenti con ordine confermato ({event.seatsSold > 0 ? `${event.seatsSold} posti venduti` : "nessun ordine"}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs mb-1 block">Oggetto *</Label>
              <Input
                value={notifySubject}
                onChange={(e) => setNotifySubject(e.target.value)}
                placeholder="Es. Aggiornamento importante sull'evento"
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Testo *</Label>
              <Textarea
                rows={5}
                value={notifyBody}
                onChange={(e) => setNotifyBody(e.target.value)}
                placeholder="Scrivi il messaggio per i tuoi partecipanti…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotifyDialogOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleNotifyAll}
              disabled={isPending || !notifySubject.trim() || !notifyBody.trim()}
            >
              {isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Invia a tutti
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
