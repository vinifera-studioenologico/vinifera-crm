"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatEUR } from "@/lib/utils/money";
import type { EventStatsSummary, MonthlyStatEntry } from "@/server/actions/event-stats-logic";

interface Props {
  byEvent: EventStatsSummary[];
  byMonth: MonthlyStatEntry[];
  totals: { netCents: number; participants: number; orders: number };
  year: number;
}

export function StatsClient({ byEvent, byMonth, totals, year }: Props) {
  const chartData = byMonth.map((m) => ({
    month: m.month.slice(5), // "MM"
    netto: m.netCents / 100,
    ordini: m.orderCount,
  }));

  return (
    <div className="space-y-8">
      {/* KPI globali */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-muted/40 p-5">
          <p className="text-xs text-muted-foreground mb-1">Netto {year}</p>
          <p className="text-2xl font-bold tabular-nums">{formatEUR(totals.netCents)}</p>
        </div>
        <div className="rounded-xl bg-muted/40 p-5">
          <p className="text-xs text-muted-foreground mb-1">Partecipanti</p>
          <p className="text-2xl font-bold tabular-nums">{totals.participants}</p>
        </div>
        <div className="rounded-xl bg-muted/40 p-5">
          <p className="text-xs text-muted-foreground mb-1">Ordini</p>
          <p className="text-2xl font-bold tabular-nums">{totals.orders}</p>
        </div>
      </div>

      {/* Grafico mensile */}
      {byMonth.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wide">Entrate mensili</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${v}`} />
              <Tooltip formatter={(v: unknown) => typeof v === "number" ? `€${v.toFixed(2)}` : String(v)} />
              <Bar dataKey="netto" fill="#145a44" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per evento */}
      <div>
        <h2 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wide">Per evento</h2>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Evento</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Lordo</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Rimborsato</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Netto</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Riempimento</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Ticket medio</th>
              </tr>
            </thead>
            <tbody>
              {byEvent.map((ev) => (
                <tr key={ev.eventId} className="border-t border-border">
                  <td className="px-4 py-3 font-medium truncate max-w-[200px]">{ev.eventTitle}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatEUR(ev.grossCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-destructive">
                    {ev.refundedCents > 0 ? `- ${formatEUR(ev.refundedCents)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatEUR(ev.netCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {ev.seatsSold}/{ev.capacity} ({ev.fillPercent}%)
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {ev.avgTicketCents !== null ? formatEUR(ev.avgTicketCents) : "—"}
                  </td>
                </tr>
              ))}
              {byEvent.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">Nessun dato per l&apos;anno selezionato.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
