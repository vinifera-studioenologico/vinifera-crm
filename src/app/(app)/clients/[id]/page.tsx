import { notFound } from "next/navigation";
import {
  Mail,
  Phone,
  MapPin,
  FileText,
  Tag,
  Building2,
  Receipt,
} from "lucide-react";

import { getClient } from "@/server/actions/clients";
import { formatEUR } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface Props {
  params: Promise<{ id: string }>;
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <Icon
        className="size-4 text-muted-foreground mt-0.5 shrink-0"
        strokeWidth={1.5}
      />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}

export default async function ClientOverviewPage({ params }: Props) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  const stats = client.stats;
  const addr = client.address;
  const addrString =
    addr
      ? [addr.street, addr.zip && addr.city ? `${addr.zip} ${addr.city}` : (addr.city ?? ""), addr.province]
          .filter(Boolean)
          .join(", ")
      : null;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      {/* KPI mini-cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Analisi rimaste</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {stats.remainingAnalyses}
          </p>
          <p className="text-xs text-muted-foreground">
            {stats.activePackagesCount > 0
              ? `in ${stats.activePackagesCount} pacchett${stats.activePackagesCount === 1 ? "o" : "i"}`
              : "nessun pacchetto attivo"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Importo pendente</p>
          <p
            className={`mt-1 text-2xl font-semibold tabular-nums ${
              stats.pendingAmountCents > 0 ? "text-amber-600 dark:text-amber-400" : ""
            }`}
          >
            {stats.pendingAmountCents > 0
              ? formatEUR(stats.pendingAmountCents)
              : "—"}
          </p>
          {stats.overdueAmountCents > 0 && (
            <p className="text-xs text-destructive">
              {formatEUR(stats.overdueAmountCents)} scaduto
            </p>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Fatturato totale</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {stats.totalRevenueCents > 0
              ? formatEUR(stats.totalRevenueCents)
              : "—"}
          </p>
          {stats.samplesPending > 0 && (
            <p className="text-xs text-muted-foreground">
              {stats.samplesPending} campion{stats.samplesPending === 1 ? "e" : "i"} in corso
            </p>
          )}
        </div>
      </div>

      {/* Dati anagrafici */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Dati anagrafici</h2>
        <div className="space-y-3">
          <InfoRow icon={Mail} label="Email" value={client.email} />
          <InfoRow icon={Phone} label="Telefono" value={client.phone} />
          <InfoRow icon={MapPin} label="Indirizzo" value={addrString} />

          {client.type === "business" && (
            <>
              <InfoRow icon={Building2} label="P.IVA" value={client.vatNumber} />
              {client.pec && <InfoRow icon={Mail} label="PEC" value={client.pec} />}
              {client.sdiCode && (
                <InfoRow icon={Receipt} label="Codice SDI" value={client.sdiCode} />
              )}
              {client.taxCode && (
                <InfoRow icon={FileText} label="Codice fiscale" value={client.taxCode} />
              )}
            </>
          )}

          {client.type === "individual" && client.taxCode && (
            <InfoRow icon={FileText} label="Codice fiscale" value={client.taxCode} />
          )}
        </div>

        {client.notes && (
          <>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground mb-1">Note interne</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{client.notes}</p>
            </div>
          </>
        )}

        {client.tags && client.tags.length > 0 && (
          <>
            <Separator />
            <div className="flex items-center gap-2 flex-wrap">
              <Tag className="size-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
              {client.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="font-normal">
                  {tag}
                </Badge>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
