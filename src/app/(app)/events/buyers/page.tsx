import { getBuyersHistory } from "@/server/actions/eventOrders";
import { formatEUR } from "@/lib/utils/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Storico acquirenti — Vinifera" };

export default async function BuyersPage() {
  const groups = await getBuyersHistory();

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Storico acquirenti</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {groups.length} acquirente/i con consenso al riconoscimento dati.
          Solo ordini con consenso esplicito.
        </p>
      </div>

      {groups.length === 0 && (
        <p className="text-muted-foreground text-sm">Nessun dato disponibile.</p>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Acquirente</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Contatti</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Ordini</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Posti</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Speso</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium">{group.displayName}</p>
                  {group.eventTitles.length > 0 && (
                    <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                      {group.eventTitles.join(", ")}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  {group.emails.map((e) => (
                    <p key={e} className="text-xs text-muted-foreground">{e}</p>
                  ))}
                  {group.phones.map((p) => (
                    <p key={p} className="text-xs text-muted-foreground">{p}</p>
                  ))}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{group.orderCount}</td>
                <td className="px-4 py-3 text-right tabular-nums">{group.totalSeats}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {group.totalSpentCents === 0
                    ? <span className="text-green-700 dark:text-green-400">Gratuito</span>
                    : formatEUR(group.totalSpentCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
