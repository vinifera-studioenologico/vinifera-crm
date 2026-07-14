"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { it as itLocale } from "date-fns/locale";

import type { EventDoc } from "@/schemas/event";
import { archiveEvent, restoreEvent } from "@/server/actions/events";
import { formatEUR } from "@/lib/utils/money";
import { derivePublicStatus, seatsAvailable, isFreeEvent } from "@/lib/events/status";
import { cn } from "@/lib/utils";

import { DataTable } from "@/components/data-table/DataTable";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EventStatusBadge } from "./EventStatusBadge";

interface Props {
  initialData: EventDoc[];
}

function getDisplayStatus(ev: EventDoc) {
  if (ev.deletedAt) return "draft"; // archiviato
  if (ev.status === "draft") return "draft";
  if (ev.status === "cancelled") return "cancelled";
  // Deriva stato pubblico per eventi published
  const ps = derivePublicStatus(
    {
      status: ev.status,
      startsAt: new Date(ev.startsAt as string),
      endsAt: ev.endsAt ? new Date(ev.endsAt as string) : null,
      bookingOpensAt: ev.bookingOpensAt ? new Date(ev.bookingOpensAt as string) : null,
      bookingClosesAt: ev.bookingClosesAt ? new Date(ev.bookingClosesAt as string) : null,
      capacity: ev.capacity,
      seatsSold: ev.seatsSold,
      seatsHeld: ev.seatsHeld,
    },
    new Date(),
  );
  return ps ?? "draft";
}

export function EventsClient({ initialData }: Props) {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [, startTransition] = useTransition();

  const filtered = initialData.filter((ev) => {
    if (!showArchived && ev.deletedAt !== null) return false;
    if (showArchived && ev.deletedAt === null) return false;
    return true;
  });

  function handleArchive(row: EventDoc) {
    startTransition(async () => {
      const result = await archiveEvent(row.id);
      if (result.success) {
        toast.success("Evento archiviato");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleRestore(row: EventDoc) {
    startTransition(async () => {
      const result = await restoreEvent(row.id);
      if (result.success) {
        toast.success("Evento ripristinato");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const columns: ColumnDef<EventDoc>[] = [
    {
      accessorKey: "title",
      header: "Titolo",
      cell: ({ row }) => {
        const ev = row.original;
        const isArchived = ev.deletedAt !== null;
        return (
          <div className={cn("flex flex-col min-w-0", isArchived && "opacity-60")}>
            <Link
              href={`/events/${ev.id}`}
              className="font-medium truncate hover:text-primary transition-colors"
            >
              {ev.title?.it || ev.slug}
            </Link>
            <span className="text-xs text-muted-foreground truncate">{ev.slug}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "startsAt",
      header: "Data inizio",
      size: 150,
      cell: ({ row }) => {
        const val = row.original.startsAt;
        if (!val) return "—";
        try {
          return (
            <span className="text-sm tabular-nums">
              {format(new Date(val as string), "dd/MM/yyyy HH:mm", { locale: itLocale })}
            </span>
          );
        } catch {
          return "—";
        }
      },
    },
    {
      id: "status",
      header: "Stato",
      size: 130,
      cell: ({ row }) => <EventStatusBadge status={getDisplayStatus(row.original)} />,
    },
    {
      id: "seats",
      header: "Posti",
      size: 110,
      cell: ({ row }) => {
        const ev = row.original;
        const avail = seatsAvailable(ev);
        const isOverbooked = avail < 0;
        return (
          <span className={cn("text-sm tabular-nums", isOverbooked && "text-destructive font-semibold")}>
            {ev.seatsSold}/{ev.capacity}
            {ev.seatsHeld > 0 && (
              <span className="text-muted-foreground"> (+{ev.seatsHeld})</span>
            )}
          </span>
        );
      },
    },
    {
      id: "price",
      header: "Prezzo",
      size: 100,
      cell: ({ row }) => {
        const ev = row.original;
        if (isFreeEvent(ev)) return <span className="text-sm font-medium text-green-700 dark:text-green-400">Gratuito</span>;
        if (ev.discountedPriceCents) {
          return (
            <span className="text-sm tabular-nums">
              <span className="line-through text-muted-foreground mr-1">{formatEUR(ev.priceCents)}</span>
              {formatEUR(ev.discountedPriceCents)}
            </span>
          );
        }
        return <span className="text-sm tabular-nums">{formatEUR(ev.priceCents)}</span>;
      },
    },
    {
      id: "actions",
      header: "",
      size: 80,
      cell: ({ row }) => {
        const ev = row.original;
        if (ev.deletedAt !== null) {
          return (
            <Button variant="ghost" size="sm" onClick={() => handleRestore(ev)}>
              Ripristina
            </Button>
          );
        }
        return (
          <Button variant="ghost" size="sm" onClick={() => handleArchive(ev)}>
            Archivia
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Eventi</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="mt-2 text-2xl font-semibold">Eventi</h1>
        </div>
        <Link href="/events/new">
          <Button>
            <Plus className="mr-2 size-4" strokeWidth={1.75} />
            Nuovo evento
          </Button>
        </Link>
      </div>

      {/* Filtro archiviati */}
      <div className="flex items-center gap-2">
        <Switch
          id="show-archived"
          checked={showArchived}
          onCheckedChange={setShowArchived}
        />
        <Label htmlFor="show-archived" className="cursor-pointer text-sm text-muted-foreground">
          Mostra archiviati
        </Label>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-8">
            {showArchived ? "Nessun evento archiviato." : "Nessun evento. Crea il primo!"}
          </p>
        )}
        {filtered.map((ev) => (
          <Link
            key={ev.id}
            href={`/events/${ev.id}`}
            className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-sm">{ev.title?.it || ev.slug}</span>
              <EventStatusBadge status={getDisplayStatus(ev)} />
            </div>
            <span className="text-xs text-muted-foreground">
              {ev.startsAt
                ? format(new Date(ev.startsAt as string), "dd/MM/yyyy HH:mm", { locale: itLocale })
                : "—"}
            </span>
            <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
              <span>
                {ev.seatsSold}/{ev.capacity} posti{" "}
                {ev.seatsHeld > 0 ? `(+${ev.seatsHeld} hold)` : ""}
              </span>
              <span>
                {isFreeEvent(ev) ? (
                  <span className="text-green-700 dark:text-green-400 font-medium">Gratuito</span>
                ) : (
                  formatEUR(ev.discountedPriceCents ?? ev.priceCents)
                )}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={filtered}
          initialSorting={[{ id: "startsAt", desc: false }]}
          emptyMessage={showArchived ? "Nessun evento archiviato." : "Nessun evento. Crea il primo!"}
          onRowClick={(row) => router.push(`/events/${row.id}`)}
        />
      </div>
    </div>
  );
}
