"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { it as itLocale } from "date-fns/locale";

import type { SubscriberRow } from "@/server/actions/subscribers";
import { unsubscribeSubscriber } from "@/server/actions/subscribers";

import { DataTable } from "@/components/data-table/DataTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "outline" | "destructive" }> = {
  active: { label: "Attivo", variant: "default" },
  pending: { label: "In attesa", variant: "outline" },
  unsubscribed: { label: "Disiscritto", variant: "destructive" },
};

interface Props {
  initialData: SubscriberRow[];
}

export function SubscribersClient({ initialData }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function handleUnsubscribe(sub: SubscriberRow) {
    startTransition(async () => {
      const result = await unsubscribeSubscriber(sub.id);
      if (result.success) {
        toast.success("Iscritto rimosso");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleExportCsv() {
    const active = initialData.filter((s) => s.status !== "unsubscribed");
    const rows = [
      ["Email", "Stato", "Lingua", "Data iscrizione"].join(","),
      ...active.map((s) => [
        s.email,
        s.status,
        s.locale,
        s.createdAt ? new Date(s.createdAt).toLocaleDateString("it-IT") : "",
      ].join(",")),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `iscritti-eventi-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: ColumnDef<SubscriberRow>[] = [
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <span className="font-medium text-sm">{row.original.email}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Stato",
      size: 120,
      cell: ({ row }) => {
        const cfg = STATUS_BADGE[row.original.status] ?? STATUS_BADGE["pending"]!;
        return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
      },
    },
    {
      accessorKey: "locale",
      header: "Lingua",
      size: 80,
      cell: ({ row }) => (
        <span className="text-sm uppercase text-muted-foreground">{row.original.locale}</span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Iscritto il",
      size: 130,
      cell: ({ row }) => {
        const ts = row.original.createdAt;
        if (!ts) return "—";
        try {
          return <span className="text-sm tabular-nums">{format(new Date(ts), "dd/MM/yyyy", { locale: itLocale })}</span>;
        } catch { return "—"; }
      },
    },
    {
      id: "actions",
      header: "",
      size: 120,
      cell: ({ row }) => {
        if (row.original.status === "unsubscribed") return null;
        return (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive text-xs"
            onClick={() => handleUnsubscribe(row.original)}
          >
            Rimuovi (GDPR)
          </Button>
        );
      },
    },
  ];

  const activeCount = initialData.filter((s) => s.status === "active").length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>Eventi</BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Iscritti mailing list</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="mt-2 text-2xl font-semibold">Iscritti mailing list</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeCount} iscritto/i attivo/i · {initialData.length} totale
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={activeCount === 0}>
          <Download className="mr-1.5 size-4" strokeWidth={1.75} />
          Esporta CSV
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={initialData}
        initialSorting={[{ id: "createdAt", desc: true }]}
        emptyMessage="Nessun iscritto."
      />
    </div>
  );
}
