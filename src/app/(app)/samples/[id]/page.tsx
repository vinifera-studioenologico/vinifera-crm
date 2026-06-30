import { notFound } from "next/navigation";
import {
  getSample,
  getAdjacentInProgressSamples,
  getLinkedPaymentSummary,
} from "@/server/actions/samples";
import { getAnalyses } from "@/server/actions/analyses";
import { SampleDetailClient } from "./_components/SampleDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const sample = await getSample(id);
  return { title: sample ? `${sample.code} — Vinifera` : "Campione" };
}

export default async function SampleDetailPage({ params }: Props) {
  const { id } = await params;
  const sample = await getSample(id);
  if (!sample) notFound();

  const editable = sample.status === "pending" || sample.status === "in_progress";

  const [adjacent, analyses, linkedPayment] = await Promise.all([
    sample.status === "in_progress"
      ? getAdjacentInProgressSamples(id)
      : Promise.resolve({ prevId: null, nextId: null }),
    editable ? getAnalyses() : Promise.resolve([]),
    sample.paymentId
      ? getLinkedPaymentSummary(sample.paymentId)
      : Promise.resolve(null),
  ]);

  return (
    <SampleDetailClient
      sample={sample}
      adjacentIds={adjacent}
      analyses={analyses}
      linkedPayment={linkedPayment}
    />
  );
}
