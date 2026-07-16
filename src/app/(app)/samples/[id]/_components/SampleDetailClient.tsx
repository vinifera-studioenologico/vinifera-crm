"use client";

import { useRef, useState, useTransition } from "react";
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
  ChevronLeft,
  ChevronRight,
  Search,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";

import type { SampleDoc, SampleStatus, SampleSamplingBy } from "@/schemas/sample";
import type { AnalysisDoc } from "@/schemas/analysis";
import {
  updateSampleStatus,
  saveSampleResults,
  addSampleNote,
  deleteSampleNote,
  addSampleAnalyses,
  removeSampleAnalysis,
  updateSampleMetadata,
} from "@/server/actions/samples";
import { formatEUR } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";

import { Button, buttonVariants } from "@/components/ui/button";
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
  adjacentIds: { prevId: string | null; nextId: string | null };
  analyses: AnalysisDoc[];
  linkedPayment: { totalAmountCents: number; status: string } | null;
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

export function SampleDetailClient({ sample, adjacentIds, analyses, linkedPayment }: Props) {
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

  // ── Metadati campione (prodotto dichiarato, quantità, imballaggio, ecc.) ──
  const [metadata, setMetadata] = useState({
    declaredProduct: sample.declaredProduct ?? "",
    sampleQuantity: sample.sampleQuantity ?? "",
    packaging: sample.packaging ?? "",
    samplingBy: sample.samplingBy ?? "",
  });
  const [isSavingMetadata, startSaveMetadata] = useTransition();

  // ── Aggiunta / rimozione analisi (solo campioni modificabili) ─────────
  const editable = sample.status === "pending" || sample.status === "in_progress";
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
  const [isMutatingItems, startMutateItems] = useTransition();
  const [removeTarget, setRemoveTarget] = useState<SampleDoc["items"][number] | null>(null);

  // ── Swipe orizzontale (mobile/tablet) per passare al campione prev/next ──
  const SWIPE_MIN_DISTANCE = 60;
  const SWIPE_MAX_VISUAL_OFFSET = 96;

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragDirectionRef = useRef<"horizontal" | "vertical" | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingDeltaRef = useRef(0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 1) {
      touchStartRef.current = null;
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, select, button, a")) {
      touchStartRef.current = null;
      return;
    }
    const touch = e.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    dragDirectionRef.current = null;
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current;
    if (!start) return;
    const touch = e.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    // Decide una sola volta se il gesto è orizzontale o verticale
    if (dragDirectionRef.current === null) {
      if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) return;
      dragDirectionRef.current =
        Math.abs(deltaX) > Math.abs(deltaY) * 1.5 ? "horizontal" : "vertical";
      if (dragDirectionRef.current === "horizontal") setIsDragging(true);
    }
    if (dragDirectionRef.current !== "horizontal") return;

    pendingDeltaRef.current = deltaX;
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        setDragX(pendingDeltaRef.current);
        rafRef.current = null;
      });
    }
  }

  function resetSwipe() {
    touchStartRef.current = null;
    dragDirectionRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsDragging(false);
    setDragX(0);
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current;
    const wasHorizontal = dragDirectionRef.current === "horizontal";
    if (!start || !wasHorizontal) {
      resetSwipe();
      return;
    }

    const touch = e.changedTouches[0];
    if (!touch) {
      resetSwipe();
      return;
    }
    const deltaX = touch.clientX - start.x;

    if (deltaX <= -SWIPE_MIN_DISTANCE && adjacentIds.nextId) {
      router.push(`/samples/${adjacentIds.nextId}`);
      return;
    }
    if (deltaX >= SWIPE_MIN_DISTANCE && adjacentIds.prevId) {
      router.push(`/samples/${adjacentIds.prevId}`);
      return;
    }
    resetSwipe();
  }

  // Offset visivo con resistenza quando non c'è un campione adiacente in quella direzione
  const swipingToNext = dragX < 0;
  const hasAdjacentInDragDirection = swipingToNext ? !!adjacentIds.nextId : !!adjacentIds.prevId;
  const dragResistance = hasAdjacentInDragDirection ? 0.5 : 0.15;
  const visualOffset = Math.max(
    -SWIPE_MAX_VISUAL_OFFSET,
    Math.min(SWIPE_MAX_VISUAL_OFFSET, dragX * dragResistance),
  );
  const swipeProgress = Math.min(Math.abs(dragX) / SWIPE_MIN_DISTANCE, 1);

  function toggleSelectToAdd(analysisId: string) {
    setSelectedToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(analysisId)) next.delete(analysisId);
      else next.add(analysisId);
      return next;
    });
  }

  function handleAddAnalyses() {
    if (selectedToAdd.size === 0) return;
    startMutateItems(async () => {
      const res = await addSampleAnalyses(sample.id, [...selectedToAdd], version);
      if (res.success) {
        setVersion(res.data.version);
        setSelectedToAdd(new Set());
        setAddSearch("");
        setAddOpen(false);
        toast.success(
          selectedToAdd.size === 1 ? "Analisi aggiunta" : "Analisi aggiunte",
        );
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleRemoveAnalysis() {
    const target = removeTarget;
    if (!target) return;
    startMutateItems(async () => {
      const res = await removeSampleAnalysis(sample.id, target.analysisId, version);
      if (res.success) {
        setVersion(res.data.version);
        setRemoveTarget(null);
        toast.success("Analisi rimossa");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

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

  function handleSaveMetadata() {
    startSaveMetadata(async () => {
      const res = await updateSampleMetadata(
        sample.id,
        {
          declaredProduct: metadata.declaredProduct || undefined,
          sampleQuantity: metadata.sampleQuantity || undefined,
          packaging: metadata.packaging || undefined,
          samplingBy: metadata.samplingBy || undefined,
        },
        version,
      );
      if (res.success) {
        toast.success("Dettagli campione aggiornati");
        setVersion(res.data.version);
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

  // Catalogo analisi aggiungibili (attive, non archiviate, non già presenti)
  const presentIds = new Set(sample.items.map((it) => it.analysisId));
  const addableAnalyses = analyses
    .filter((a) => a.active && a.deletedAt === null && !presentIds.has(a.id))
    .filter((a) => {
      if (!addSearch.trim()) return true;
      const q = addSearch.toLowerCase();
      return a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q);
    })
    .sort((a, b) => a.name.localeCompare(b.name, "it"));

  // Avviso disallineamento col pagamento collegato
  const paymentMismatch =
    linkedPayment !== null &&
    linkedPayment.status !== "cancelled" &&
    linkedPayment.totalAmountCents !== sample.estimatedTotalCents;

  return (
    <div
      className="p-4 md:p-6 max-w-4xl space-y-6"
      style={{
        transform: dragX !== 0 ? `translateX(${visualOffset}px)` : undefined,
        transition: isDragging ? "none" : "transform 200ms ease-out",
        touchAction: "pan-y",
        userSelect: isDragging ? "none" : undefined,
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={resetSwipe}
    >
      {/* Indicatori di swipe (mobile/tablet) */}
      {isDragging && !swipingToNext && adjacentIds.prevId && (
        <div
          className="fixed left-3 top-1/2 z-50 -translate-y-1/2 rounded-full bg-primary p-2.5 text-primary-foreground shadow-lg pointer-events-none"
          style={{ opacity: swipeProgress }}
        >
          <ChevronLeft className="size-5" strokeWidth={2} />
        </div>
      )}
      {isDragging && swipingToNext && adjacentIds.nextId && (
        <div
          className="fixed right-3 top-1/2 z-50 -translate-y-1/2 rounded-full bg-primary p-2.5 text-primary-foreground shadow-lg pointer-events-none"
          style={{ opacity: swipeProgress }}
        >
          <ChevronRight className="size-5" strokeWidth={2} />
        </div>
      )}

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
        <div className="flex items-center gap-3">
          {/* Navigazione prev/next in lavorazione */}
          {(adjacentIds.prevId || adjacentIds.nextId) && (
            <div className="flex items-center gap-1">
              {adjacentIds.prevId ? (
                <Link
                  href={`/samples/${adjacentIds.prevId}`}
                  className={buttonVariants({ variant: "outline", size: "icon", className: "size-8" })}
                >
                  <ChevronLeft className="size-4" />
                </Link>
              ) : (
                <Button variant="outline" size="icon" className="size-8" disabled>
                  <ChevronLeft className="size-4" />
                </Button>
              )}
              {adjacentIds.nextId ? (
                <Link
                  href={`/samples/${adjacentIds.nextId}`}
                  className={buttonVariants({ variant: "outline", size: "icon", className: "size-8" })}
                >
                  <ChevronRight className="size-4" />
                </Link>
              ) : (
                <Button variant="outline" size="icon" className="size-8" disabled>
                  <ChevronRight className="size-4" />
                </Button>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-semibold tracking-tight">{sample.code}</h1>
              <SampleStatusBadge status={sample.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {sample.clientNameSnapshot} · {sample.sampleName} · Ricevuto {receivedDate}
            </p>
          </div>
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

      {/* Avviso disallineamento pagamento */}
      {paymentMismatch && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3 dark:border-amber-700/50 dark:bg-amber-950/30">
          <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" strokeWidth={1.75} />
          <div className="text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-300">
              Il totale del campione non corrisponde al pagamento collegato
            </p>
            <p className="text-amber-700/90 dark:text-amber-400/90 mt-0.5">
              Totale stimato attuale: <strong>{formatEUR(sample.estimatedTotalCents)}</strong> ·
              Pagamento collegato: <strong>{formatEUR(linkedPayment!.totalAmountCents)}</strong>.
              Aggiorna manualmente il pagamento dalla sezione Pagamenti se necessario.
            </p>
          </div>
        </div>
      )}

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

      {/* Dettagli campione (mostrati nel referto PDF se compilati) */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Dettagli campione</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Campi opzionali: se compilati, vengono riportati nel referto PDF.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={isSavingMetadata}
            onClick={handleSaveMetadata}
          >
            {isSavingMetadata ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" strokeWidth={1.75} />
            )}
            Salva
          </Button>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-xs text-muted-foreground">Prodotto dichiarato</label>
            <Input
              placeholder="es. Cerasuolo d'Abruzzo Colline Teramane Superiore DOC 2024"
              className="h-8 text-sm"
              value={metadata.declaredProduct}
              onChange={(e) =>
                setMetadata((prev) => ({ ...prev, declaredProduct: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Quantità campione</label>
            <Input
              placeholder="es. 0,50 lt"
              className="h-8 text-sm"
              value={metadata.sampleQuantity}
              onChange={(e) =>
                setMetadata((prev) => ({ ...prev, sampleQuantity: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Imballaggio</label>
            <Input
              placeholder="es. Bottiglia vetro con tappo corona"
              className="h-8 text-sm"
              value={metadata.packaging}
              onChange={(e) =>
                setMetadata((prev) => ({ ...prev, packaging: e.target.value }))
              }
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-xs text-muted-foreground">Campionamento a cura di</label>
            <select
              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
              value={metadata.samplingBy}
              onChange={(e) =>
                setMetadata((prev) => ({
                  ...prev,
                  samplingBy: e.target.value as SampleSamplingBy | "",
                }))
              }
            >
              <option value="">— Non specificato —</option>
              <option value="client">Cliente</option>
              <option value="lab">Laboratorio</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabella analisi con risultati editabili */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Analisi richieste</h2>
          <div className="flex items-center gap-2">
            {editable && (
              <Button
                size="sm"
                variant="outline"
                disabled={isMutatingItems}
                onClick={() => setAddOpen(true)}
              >
                <Plus className="size-3.5" strokeWidth={1.75} />
                Aggiungi analisi
              </Button>
            )}
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
        </div>

        <div className="divide-y divide-border">
          {sample.items.map((item) => {
            const isCovered = item.coveredByPackageId && !item.chargeAnyway;
            const canEdit = sample.status === "in_progress" || sample.status === "completed";

            return (
              <div
                key={item.analysisId}
                className={`grid gap-3 px-4 py-3 items-center ${
                  editable
                    ? "grid-cols-[1fr_160px_120px_36px]"
                    : "grid-cols-[1fr_160px_120px]"
                }`}
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

                {/* Rimuovi analisi (solo campioni modificabili) */}
                {editable && (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      disabled={isMutatingItems || sample.items.length <= 1}
                      title={
                        sample.items.length <= 1
                          ? "Deve restare almeno un'analisi"
                          : "Rimuovi analisi"
                      }
                      onClick={() => setRemoveTarget(item)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
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

      {/* Dialog aggiungi analisi */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) {
            setAddSearch("");
            setSelectedToAdd(new Set());
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Aggiungi analisi</DialogTitle>
            <DialogDescription>
              Seleziona le analisi da aggiungere al campione. La copertura da
              pacchetto, se disponibile, viene assegnata automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Cerca per nome o codice…"
              className="pl-8 h-8 text-sm"
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
            />
          </div>

          <div className="rounded-xl border border-border divide-y divide-border max-h-72 overflow-y-auto">
            {addableAnalyses.length === 0 ? (
              <p className="px-3 py-4 text-sm text-center text-muted-foreground">
                Nessuna analisi disponibile da aggiungere
              </p>
            ) : (
              addableAnalyses.map((a) => (
                <label
                  key={a.id}
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 select-none transition-colors"
                >
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 cursor-pointer accent-primary"
                    checked={selectedToAdd.has(a.id)}
                    onChange={() => toggleSelectToAdd(a.id)}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="font-semibold text-sm">{a.name}</span>
                    <span className="font-mono text-xs text-muted-foreground ml-1.5">
                      {a.code}
                    </span>
                  </span>
                  <span className="tabular-nums text-xs text-muted-foreground shrink-0">
                    {formatEUR(a.defaultPriceCents)}
                  </span>
                </label>
              ))
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={isMutatingItems}
            >
              Annulla
            </Button>
            <Button
              disabled={isMutatingItems || selectedToAdd.size === 0}
              onClick={handleAddAnalyses}
            >
              {isMutatingItems && <Loader2 className="size-3.5 animate-spin" />}
              Aggiungi{selectedToAdd.size > 0 ? ` (${selectedToAdd.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog conferma rimozione analisi */}
      <Dialog open={removeTarget !== null} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rimuovi analisi</DialogTitle>
            <DialogDescription>
              {removeTarget && (
                <>
                  Rimuovere{" "}
                  <strong>
                    {removeTarget.analysisCodeSnapshot} – {removeTarget.analysisNameSnapshot}
                  </strong>{" "}
                  dal campione?
                  {removeTarget.coveredByPackageId && !removeTarget.chargeAnyway
                    ? " L'analisi coperta verrà restituita al pacchetto."
                    : ""}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveTarget(null)}
              disabled={isMutatingItems}
            >
              Torna indietro
            </Button>
            <Button
              variant="destructive"
              disabled={isMutatingItems}
              onClick={handleRemoveAnalysis}
            >
              {isMutatingItems && <Loader2 className="size-3.5 animate-spin" />}
              Rimuovi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
