import { notFound } from "next/navigation";
import { getEvent } from "@/server/actions/events";
import { EventDetailClient } from "./_components/EventDetailClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const event = await getEvent(id);
  return { title: event ? `${event.title?.it || event.slug} — Vinifera` : "Evento" };
}

export default async function EventDetailPage({ params }: Props) {
  const { id } = await params;
  const event = await getEvent(id);

  if (!event) notFound();

  return <EventDetailClient event={event} />;
}
