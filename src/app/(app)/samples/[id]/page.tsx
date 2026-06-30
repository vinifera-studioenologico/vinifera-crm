import { notFound } from "next/navigation";
import { getSample, getAdjacentInProgressSamples } from "@/server/actions/samples";
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

  const adjacent =
    sample.status === "in_progress"
      ? await getAdjacentInProgressSamples(id)
      : { prevId: null, nextId: null };

  return <SampleDetailClient sample={sample} adjacentIds={adjacent} />;
}
