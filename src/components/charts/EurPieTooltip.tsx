import { formatEUR } from "@/lib/utils/money";

/**
 * Tooltip condiviso per i grafici a torta in euro: il valore recharts è in
 * euro (float), va riconvertito in centesimi per `formatEUR`.
 */
export function EurPieTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { fill: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!;
  return (
    <div className="rounded-lg border border-border bg-card shadow-md px-3 py-2 text-xs">
      <p className="font-semibold" style={{ color: p.payload.fill }}>
        {p.name}: {formatEUR(Math.round(p.value * 100))}
      </p>
    </div>
  );
}
