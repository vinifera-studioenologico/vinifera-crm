import { notFound } from "next/navigation";
import { getSample } from "@/server/actions/samples";
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

  return <SampleDetailClient sample={sample} />;
}
