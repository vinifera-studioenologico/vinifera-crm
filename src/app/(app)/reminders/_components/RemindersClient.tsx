"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Bell,
  CheckCircle2,
  Clock,
  AlarmClock,
  Ban,
  Pencil,
  Loader2,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import type { ReminderDoc, ReminderStatus } from "@/schemas/reminder";
import {
  markReminderDone,
  snoozeReminder,
  cancelReminder,
} from "@/server/actions/reminders";

import { ReminderForm } from "@/components/forms/ReminderForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

// ── Badge stato ───────────────────────────────────────────────────────
const STATUS_CONFIG: Record<ReminderStatus, { label: string; className: string }> = {
  pending: {
    label: "In attesa",
    className:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
  },
  done: {
    label: "Fatto",
    className:
      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  snoozed: {
    label: "Rimandato",
    className:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400",
  },
  cancelled: {
    label: "Annullato",
    className: "bg-muted text-muted-foreground border-border",
  },
};

// ── Formatta dueAt ────────────────────────────────────────────────────
function formatDueAt(ts: unknown): string {
  if (!ts) return "—";
  const d =
    typeof ts === "object" && ts !== null && "toDate" in ts
      ? (ts as { toDate: () => Date }).toDate()
      : new Date(ts as string);
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isOverdue(reminder: ReminderDoc): boolean {
  if (reminder.status !== "pending") return false;
  const d =
    typeof reminder.dueAt === "object" &&
    reminder.dueAt !== null &&
    "toDate" in (reminder.dueAt as object)
      ? (reminder.dueAt as { toDate: () => Date }).toDate()
      : new Date(reminder.dueAt as string);
  return d < new Date();
}

// ── Card singolo promemoria ───────────────────────────────────────────
function ReminderCard({
  reminder,
  onDone,
  onSnooze,
  onCancel,
  onEdit,
}: {
  reminder: ReminderDoc;
  onDone: (id: string) => void;
  onSnooze: (id: string, days: number) => void;
  onCancel: (id: string) => void;
  onEdit: (r: ReminderDoc) => void;
}) {
  const overdue = isOverdue(reminder);
  const cfg = STATUS_CONFIG[reminder.status];

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 space-y-3 transition-opacity",
        overdue && reminder.status === "pending"
          ? "border-red-300 dark:border-red-800"
          : "border-border",
        reminder.status === "done" || reminder.status === "cancelled"
          ? "opacity-60"
          : "",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium">{reminder.title}</p>
            <Badge variant="outline" className={cn("text-[10px]", cfg.className)}>
              {cfg.label}
            </Badge>
            {overdue && reminder.status === "pending" && (
              <Badge
                variant="outline"
                className="text-[10px] text-red-700 border-red-300 dark:text-red-400"
              >
                Scaduto
              </Badge>
            )}
          </div>
          {reminder.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {reminder.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            <AlarmClock className="size-3 inline mr-1" />
            {formatDueAt(reminder.dueAt)}
            {reminder.remindBeforeMinutes
              ? ` · avviso ${reminder.remindBeforeMinutes < 60 ? `${reminder.remindBeforeMinutes} min` : `${Math.round(reminder.remindBeforeMinutes / 60)}h`} prima`
              : ""}
          </p>
          {/* Canali */}
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {reminder.notifyChannels.telegram && (
              <Badge variant="outline" className="text-[10px]">
                Telegram
              </Badge>
            )}
            {reminder.notifyChannels.email && (
              <Badge variant="outline" className="text-[10px]">
                Email
              </Badge>
            )}
          </div>
        </div>

        {/* Azioni */}
        {reminder.status === "pending" && (
          <div className="flex gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => onDone(reminder.id)}
            >
              <CheckCircle2 className="size-3.5" strokeWidth={1.75} />
              Fatto
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="sm" variant="ghost" className="h-7 px-2">
                    <Clock className="size-3.5" strokeWidth={1.75} />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onSnooze(reminder.id, 1)}>
                  Rimanda 1 giorno
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSnooze(reminder.id, 3)}>
                  Rimanda 3 giorni
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSnooze(reminder.id, 7)}>
                  Rimanda 1 settimana
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onEdit(reminder)}>
                  <Pencil className="size-3.5 mr-2" strokeWidth={1.75} />
                  Modifica
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onCancel(reminder.id)}
                >
                  <Ban className="size-3.5 mr-2" strokeWidth={1.75} />
                  Annulla
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {(reminder.status === "done" || reminder.status === "snoozed" || reminder.status === "cancelled") && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 shrink-0"
            onClick={() => onEdit(reminder)}
          >
            <Pencil className="size-3.5" strokeWidth={1.75} />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Componente principale ─────────────────────────────────────────────
interface Props {
  initialData: ReminderDoc[];
  defaultClientId?: string;
}

export function RemindersClient({ initialData, defaultClientId }: Props) {
  const router = useRouter();
  const [reminders] = useState(initialData);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReminderStatus | "all">("pending");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ReminderDoc | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = reminders.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!search) return true;
    return r.title.toLowerCase().includes(search.toLowerCase());
  });

  const pendingCount = reminders.filter((r) => r.status === "pending").length;
  const overdueCount = reminders.filter(
    (r) => r.status === "pending" && isOverdue(r),
  ).length;

  function handleDone(id: string) {
    startTransition(async () => {
      const res = await markReminderDone(id);
      if (res.success) {
        toast.success("Promemoria segnato come fatto");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function handleSnooze(id: string, days: number) {
    startTransition(async () => {
      const res = await snoozeReminder(id, days);
      if (res.success) {
        toast.success(`Promemoria rimandato di ${days} giorn${days === 1 ? "o" : "i"}`);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function handleCancelConfirm() {
    if (!cancelTarget) return;
    startTransition(async () => {
      const res = await cancelReminder(cancelTarget);
      if (res.success) {
        toast.success("Promemoria annullato");
        setCancelTarget(null);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Promemoria</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Promemoria
          </h1>
          <p className="text-sm text-muted-foreground">
            {pendingCount} attiv{pendingCount === 1 ? "o" : "i"}
            {overdueCount > 0 && (
              <span className="text-red-600 dark:text-red-400 ml-2">
                · {overdueCount} scadut{overdueCount === 1 ? "o" : "i"}
              </span>
            )}
          </p>
        </div>

        <Sheet
          open={sheetOpen || editing !== null}
          onOpenChange={(open) => {
            if (!open) {
              setSheetOpen(false);
              setEditing(null);
            }
          }}
        >
          <SheetTrigger
            render={
              <Button onClick={() => setSheetOpen(true)}>
                <Plus className="size-3.5" strokeWidth={1.75} />
                Nuovo promemoria
              </Button>
            }
          />
          <SheetContent side="right" className="overflow-y-auto">
            <SheetHeader className="mb-6">
              <SheetTitle>
                {editing ? "Modifica promemoria" : "Nuovo promemoria"}
              </SheetTitle>
            </SheetHeader>
            <ReminderForm
              existing={editing ?? undefined}
              defaultRelatedTo={
                defaultClientId ? { kind: "client", id: defaultClientId } : undefined
              }
              onSuccess={() => {
                setSheetOpen(false);
                setEditing(null);
                router.refresh();
              }}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Filtri */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Cerca promemoria..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "pending", "done", "cancelled"] as const).map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(s)}
              className="text-xs"
            >
              {s === "all"
                ? "Tutti"
                : STATUS_CONFIG[s as ReminderStatus]?.label ?? s}
            </Button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-16 flex flex-col items-center gap-3 text-center">
          <Bell className="size-6 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            {search || statusFilter !== "all"
              ? "Nessun promemoria per i filtri selezionati."
              : "Nessun promemoria. Creane uno per non dimenticare nulla."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <ReminderCard
              key={r.id}
              reminder={r}
              onDone={handleDone}
              onSnooze={handleSnooze}
              onCancel={(id) => setCancelTarget(id)}
              onEdit={(r) => setEditing(r)}
            />
          ))}
        </div>
      )}

      {/* Dialog conferma annullamento */}
      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annulla promemoria</DialogTitle>
            <DialogDescription>
              Il promemoria sarà annullato. Nessuna notifica verrà inviata.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Indietro
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={handleCancelConfirm}
            >
              {isPending && <Loader2 className="size-3.5 animate-spin" />}
              Annulla promemoria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
