import { notFound } from "next/navigation";
import { getEvent } from "@/server/actions/events";
import { getEventOrders } from "@/server/actions/eventOrders";
import { OrdersPageClient } from "./_components/OrdersPageClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata = { title: "Ordini evento — Vinifera" };

export default async function EventOrdersPage({ params }: Props) {
  const { id } = await params;
  const [event, orders] = await Promise.all([getEvent(id), getEventOrders(id)]);
  if (!event) notFound();

  return (
    <OrdersPageClient
      eventId={id}
      eventPriceCents={event.discountedPriceCents ?? event.priceCents}
      initialOrders={orders}
    />
  );
}
