"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { UserPlus, Play } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { it as itLocale } from "date-fns/locale";

import type { LeadStatus } from "@/schemas/lead";
import { getLeadsWithSession, updateLeadStatus, type LeadWithSession } from "@/server/actions/leads";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils/date";

import { DataTable } from "@/components/data-table/DataTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Nuovo",
  contacted: "Contattato",
  converted: "Convertito",
  archived: "Archiviato",
};

const STATUS_VARIANTS: Record<LeadStatus, "default" | "secondary" | "outline" | "destructive"> = {
  new: "default",
  contacted: "secondary",
  converted: "default",
  archived: "outline",
};

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: "bg-blue-500",
  contacted: "bg-yellow-500",
  converted: "bg-green-500",
  archived: "bg-gray-400",
};

const SOURCE_LABELS: Record<string, string> = {
  form: "Form",
  whatsapp: "WhatsApp",
  website_form: "Form",
  website_whatsapp: "WhatsApp",
  manual: "Manuale",
};

type StatusFilter = "all" | LeadStatus;

interface Props {
  initialData: LeadWithSession[];
  hasMore: boolean;
  nextCursor: string | null;
}

export function LeadsClient({ initialData, hasMore: initialHasMore, nextCursor: initialCursor }: Props) {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadWithSession[]>(initialData);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<LeadWithSession | null>(null);
  const [newStatus, setNewStatus] = useState<LeadStatus>("new");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(false);

  function changeFilter(next: StatusFilter) {
    if (next === statusFilter) return;
    setStatusFilter(next);
    setIsLoading(true);
    startTransition(async () => {
      const result = await getLeadsWithSession(next === "all" ? {} : { status: next });
      setLeads(result.items);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
      setIsLoading(false);
    });
  }

  function loadMore() {
    if (!cursor) return;
    setIsLoading(true);
    startTransition(async () => {
      const result = await getLeadsWithSession(
        statusFilter === "all" ? { cursor } : { status: statusFilter, cursor },
      );
      setLeads((prev) => [...prev, ...result.items]);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
      setIsLoading(false);
    });
  }

  function refresh() {
    startTransition(async () => {
      const result = await getLeadsWithSession(statusFilter === "all" ? {} : { status: statusFilter });
      setLeads(result.items);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    });
  }

  function openDetail(lead: LeadWithSession) {
    setSelected(lead);
    setNewStatus(lead.status);
    setNotes(lead.notes ?? "");
  }

  function handleSave() {
    if (!selected) return;
    startTransition(async () => {
      const result = await updateLeadStatus(selected.id, newStatus, notes || undefined);
      if (result.success) {
        toast.success("Lead aggiornato");
        setSelected(null);
        refresh();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const columns: ColumnDef<LeadWithSession>[] = [
    {
      accessorKey: "createdAt",
      header: "Data",
      size: 130,
      cell: ({ row }) => {
        const isNew = row.original.status === "new";
        return (
          <div className={cn("text-xs", isNew && "font-semibold")}>
            {row.original.createdAt
              ? formatDistanceToNow(new Date(row.original.createdAt), { addSuffix: true, locale: itLocale })
              : "—"}
          </div>
        );
      },
    },
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }) => {
        const isNew = row.original.status === "new";
        return (
          <div className="flex items-center gap-2">
            {isNew && <span className="size-2 rounded-full bg-blue-500 shrink-0" />}
            <span className={cn("text-sm", isNew && "font-semibold")}>{row.original.name}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "phone",
      header: "Telefono",
      size: 130,
      cell: ({ row }) => (
        <a href={`tel:${row.original.phone}`} className="text-sm font-mono hover:underline">
          {row.original.phone}
        </a>
      ),
    },
    {
      accessorKey: "serviceTitle",
      header: "Servizio",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate max-w-[160px] block">
          {row.original.serviceTitle}
        </span>
      ),
    },
    {
      accessorKey: "source",
      header: "Fonte",
      size: 100,
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs font-normal">
          {SOURCE_LABELS[row.original.source] ?? row.original.source}
        </Badge>
      ),
    },
    {
      accessorKey: "status",
      header: "Stato",
      size: 120,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full shrink-0", STATUS_COLORS[row.original.status])} />
          <Badge variant={STATUS_VARIANTS[row.original.status]} className="text-xs">
            {STATUS_LABELS[row.original.status]}
          </Badge>
        </div>
      ),
    },
    {
      id: "actions",
      size: 80,
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => openDetail(row.original)}>
          Dettagli
        </Button>
      ),
    },
  ];

  const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "Tutti" },
    { value: "new", label: "Nuovi" },
    { value: "contacted", label: "Contattati" },
    { value: "converted", label: "Convertiti" },
    { value: "archived", label: "Archiviati" },
  ];

  return (
    <>
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Lead</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <UserPlus className="size-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Lead</h1>
          <Badge variant="secondary">{leads.length}</Badge>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-4">
        {STATUS_FILTERS.map(({ value, label }) => (
          <Button
            key={value}
            variant={statusFilter === value ? "default" : "outline"}
            size="sm"
            disabled={isLoading}
            onClick={() => changeFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={leads}
        onRowClick={(row) => openDetail(row)}
      />

      {hasMore && (
        <div className="flex justify-center mt-4">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoading}>
            {isLoading ? "Caricamento…" : "Carica altri"}
          </Button>
        </div>
      )}

      {/* Lead detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lead: {selected?.name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Telefono</p>
                  <a href={`tel:${selected.phone}`} className="font-medium hover:underline">{selected.phone}</a>
                </div>
                {selected.email && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-0.5">Email</p>
                    <a href={`mailto:${selected.email}`} className="font-medium hover:underline truncate block">{selected.email}</a>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Servizio</p>
                  <p className="font-medium">{selected.serviceTitle}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Fonte</p>
                  <p className="font-medium">{SOURCE_LABELS[selected.source] ?? selected.source}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Lingua</p>
                  <p className="font-medium uppercase">{selected.locale}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Data</p>
                  <p className="font-medium">{selected.createdAt ? formatDateTime(selected.createdAt) : "—"}</p>
                </div>
              </div>

              {selected.message && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Messaggio</p>
                  <p className="text-sm bg-muted rounded p-2">{selected.message}</p>
                </div>
              )}

              {selected.pageUrl && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Pagina di provenienza</p>
                  <a href={selected.pageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline truncate block">
                    {selected.pageUrl}
                  </a>
                </div>
              )}

              {selected.sessionLink && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Sessione PostHog</p>
                  <a
                    href={selected.sessionLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-500 hover:underline font-medium"
                  >
                    <Play className="h-3 w-3" />
                    Guarda la sessione
                  </a>
                </div>
              )}

              {(selected.utmSource || selected.utmMedium || selected.utmCampaign) && (
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {selected.utmSource && <p>utm_source: {selected.utmSource}</p>}
                  {selected.utmMedium && <p>utm_medium: {selected.utmMedium}</p>}
                  {selected.utmCampaign && <p>utm_campaign: {selected.utmCampaign}</p>}
                </div>
              )}

              <div className="space-y-2">
                <Label>Stato</Label>
                <Select value={newStatus} onValueChange={(v) => setNewStatus(v as LeadStatus)}>
                  <SelectTrigger>
                    <SelectValue>{STATUS_LABELS[newStatus]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(["new", "contacted", "converted", "archived"] as const).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Note interne</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Aggiungi note..."
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelected(null)}>Chiudi</Button>
                <Button onClick={handleSave} disabled={isPending}>
                  Salva
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
