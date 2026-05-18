import { notFound } from "next/navigation";

import { getQuote } from "@/server/actions/quotes";
import { getClients } from "@/server/actions/clients";
import { getAnalyses } from "@/server/actions/analyses";
import { getPackages } from "@/server/actions/packages";
import { getCompanySettings } from "@/server/actions/settings";
import { QuoteDetailClient } from "./_components/QuoteDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const quote = await getQuote(id);
  return { title: quote ? `Preventivo ${quote.number} — Vinifera` : "Preventivo" };
}

export default async function QuoteDetailPage({ params }: Props) {
  const { id } = await params;

  const [quote, clientsResult, analyses, packages, settings] = await Promise.all([
    getQuote(id),
    getClients(),
    getAnalyses(),
    getPackages(),
    getCompanySettings(),
  ]);

  if (!quote) notFound();

  return (
    <QuoteDetailClient
      quote={quote}
      clients={clientsResult.items}
      analyses={analyses}
      packages={packages}
      defaultEnpaiaApplied={settings?.defaultEnpaiaApplied ?? false}
      defaultEnpaiaPercent={settings?.defaultEnpaiaPercent ?? 4}
    />
  );
}
