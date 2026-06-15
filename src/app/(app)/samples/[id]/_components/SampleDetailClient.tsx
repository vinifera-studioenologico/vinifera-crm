"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  PlayCircle,
  Ban,
  Loader2,
  Save,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";

import type { SampleDoc, SampleStatus } from "@/schemas/sample";
import { updateSampleStatus, saveSampleResults, addSampleNote, deleteSampleNote } from "@/server/actions/samples";
import { formatEUR } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SampleStatusBadge } from "@/components/widgets/SampleStatusBadge";

interface Props {
  sample: SampleDoc;
}

const STATUS_TRANSITIONS: Array<{
  from: SampleStatus[];
  to: SampleStatus;
  label: string;
  icon: React.ElementType;
  variant: "default" | "outline" | "destructive";
  confirm?: boolean;
}> = [
  {
    from: ["pending"],
    to: "in_progress",
    label: "Avvia lavorazione",
    icon: PlayCircle,
    variant: "default",
  },
  {
    from: ["in_progress"],
    to: "completed",
    label: "Completa campione",
    icon: CheckCircle2,
    variant: "default",
  },
  {
    from: ["pending", "in_progress"],
    to: "cancelled",
    label: "Annulla",
    icon: Ban,
    variant: "destructive",
    confirm: true,
  },
];

export function SampleDetailClient({ sample }: Props) {
  const router = useRouter();
  const [results, setResults] = useState<Record<string, string>>(
    Object.fromEntries(
      sample.items.map((it) => [it.analysisId, it.result ?? ""]),
    ),
  );
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [version, setVersion] = useState(sample.version);
  const [isPending, startTransition] = useTransition();
  const [isSavingResults, startSaveResults] = useTransition();
  const [newNote, setNewNote] = useState("");
  const [isAddingNote, startAddNote] = useTransition();
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  function handleTransition(to: SampleStatus) {
    startTransition(async () => {
      // Quando si completa il campione, salva prima i risultati in sospeso
      if (to === "completed") {
        const payload = Object.entries(results).map(([analysisId, result]) => ({
          analysisId,
          result,
        }));
        const saveRes = await saveSampleResults(sample.id, payload, version);
        if (!saveRes.success) {
          toast.error(saveRes.error);
          return;
        }
      }

      const result = await updateSampleStatus(sample.id, to);
      if (result.success) {
        toast.success(
          to === "completed"
            ? "Campione completato"
            : to === "in_progress"
              ? "Lavorazione avviata"
              : "Campione annullato",
        );
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setConfirmCancel(false);
    });
  }

  function handleSaveResults() {
    startSaveResults(async () => {
      const payload = Object.entries(results).map(([analysisId, result]) => ({
        analysisId,
        result,
      }));
      const res = await saveSampleResults(sample.id, payload, version);
      if (res.success) {
        toast.success("Risultati salvati");
        setVersion((v) => v + 1);
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleAddNote() {
    const trimmed = newNote.trim();
    if (!trimmed) return;
    startAddNote(async () => {
      const res = await addSampleNote(sample.id, trimmed);
      if (res.success) {
        setNewNote("");
        toast.success("Nota aggiunta");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleDeleteNote(noteId: string) {
    setDeletingNoteId(noteId);
    startTransition(async () => {
      const res = await deleteSampleNote(sample.id, noteId);
      if (res.success) {
        toast.success("Nota eliminata");
        router.refresh();
      } else {
        toast.error(res.error);
      }
      setDeletingNoteId(null);
    });
  }

  const availableTransitions = STATUS_TRANSITIONS.filter((t) =>
    t.from.includes(sample.status),
  );

  const receivedDate = sample.receivedAt
    ? formatDate(sample.receivedAt as Parameters<typeof formatDate>[0])
    : "—";

  const chargeableItems = sample.items.filter(
    (it) => !(it.coveredByPackageId && !it.chargeAnyway),
  );
  const coveredItems = sample.items.filter(
    (it) => it.coveredByPackageId && !it.chargeAnyway,
  );

  return (
    <div className="p-4 md:p-6 max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>
              <Link href="/samples" className="hover:text-foreground transition-colors">
                Campioni
              </Link>
            </BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{sample.code}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-semibold tracking-tight">{sample.code}</h1>
            <SampleStatusBadge status={sample.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {sample.clientNameSnapshot} · {sample.sampleName} · Ricevuto {receivedDate}
          </p>
        </div>

        {/* Azioni */}
        <div className="flex gap-2 flex-wrap">
          {availableTransitions.map((t) => (
            <Button
              key={t.to}
              variant={t.variant}
              size="sm"
              disabled={isPending}
              onClick={() =>
                t.confirm ? setConfirmCancel(true) : handleTransition(t.to)
              }
            >
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <t.icon className="size-3.5" strokeWidth={1.75} />
              )}
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Riepilogo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Analisi totali</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">{sample.items.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Coperte da pacchetto</p>
          <p className="text-2xl font-semibold tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">
            {coveredItems.length}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Da fatturare</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">{chargeableItems.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Totale stimato</p>
          <p className="text-xl font-semibold tabular-nums mt-1">
            {formatEUR(sample.estimatedTotalCents)}
          </p>
        </div>
      </div>

      {/* Tabella analisi con risultati editabili */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">Analisi richieste</h2>
          {(sample.status === "in_progress" || sample.status === "completed") && (
            <Button
              size="sm"
              variant="outline"
              disabled={isSavingResults}
              onClick={handleSaveResults}
            >
              {isSavingResults ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" strokeWidth={1.75} />
              )}
              Salva risultati
            </Button>
          )}
        </div>

        <div className="divide-y divide-border">
          {sample.items.map((item) => {
            const isCovered = item.coveredByPackageId && !item.chargeAnyway;
            const canEdit = sample.status === "in_progress" || sample.status === "completed";

            return (
              <div
                key={item.analysisId}
                className="grid grid-cols-[1fr_160px_120px] gap-3 px-4 py-3 items-center"
              >
                <div>
                  <p className="text-sm font-medium">
                    <span className="font-mono text-xs text-muted-foreground mr-1.5">
                      {item.analysisCodeSnapshot}
                    </span>
                    {item.analysisNameSnapshot}
                  </p>
                  {isCovered ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] h-4 mt-0.5 text-emerald-700 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700"
                    >
                      Coperto da pacchetto
                    </Badge>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatEUR(item.unitPriceCents)}
                    </p>
                  )}
                </div>

                {/* Risultato (editabile in lavorazione) */}
                <div>
                  {canEdit ? (
                    <Input
                      placeholder="Inserisci risultato..."
                      className="h-7 text-sm"
                      value={results[item.analysisId] ?? ""}
                      onChange={(e) =>
                        setResults((prev) => ({
                          ...prev,
                          [item.analysisId]: e.target.value,
                        }))
                      }
                    />
                  ) : (
                    <p className="text-sm">
                      {item.result ? (
                        item.result
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </p>
                  )}
                </div>

                {/* Stato risultato */}
                <div className="flex justify-end">
                  {item.result ? (
                    <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300 dark:text-emerald-400">
                      Risultato inserito
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      In attesa
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Note */}
      {sample.notes && (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground mb-2">Note interne</p>
          <p className="text-sm whitespace-pre-wrap">{sample.notes}</p>
        </div>
      )}

      {/* Note aggiuntive */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Note aggiuntive</h2>
        </div>

        {/* Lista note esistenti */}
        {(sample.additionalNotes?.length ?? 0) > 0 ? (
          <div className="divide-y divide-border">
            {sample.additionalNotes!.map((note) => (
              <div key={note.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm whitespace-pre-wrap">{note.text}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formatDate(note.createdAt as Parameters<typeof formatDate>[0])}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={deletingNoteId === note.id}
                  onClick={() => handleDeleteNote(note.id)}
                >
                  {deletingNoteId === note.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-3 text-sm text-muted-foreground">Nessuna nota aggiuntiva</p>
        )}

        {/* Form nuova nota */}
        <div className="px-4 py-3 border-t border-border flex gap-2">
          <Textarea
            placeholder="Scrivi una nota..."
            className="min-h-15 text-sm"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            maxLength={2000}
          />
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 self-end"
            disabled={isAddingNote || !newNote.trim()}
            onClick={handleAddNote}
          >
            {isAddingNote ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            Aggiungi
          </Button>
        </div>
      </div>

      {/* Motivo annullamento */}
      {sample.status === "cancelled" && sample.cancelReason && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <p className="text-xs text-destructive/70 mb-2">Motivo annullamento</p>
          <p className="text-sm">{sample.cancelReason}</p>
        </div>
      )}

      {/* Dialog conferma annullamento */}
      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annulla campione</DialogTitle>
            <DialogDescription>
              Il campione <strong>{sample.code}</strong> sarà annullato. Le analisi
              coperte da pacchetto non verranno restituite automaticamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>
              Torna indietro
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => handleTransition("cancelled")}
            >
              {isPending && <Loader2 className="size-3.5 animate-spin" />}
              Annulla campione
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
