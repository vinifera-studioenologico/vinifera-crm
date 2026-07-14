import { OrdersPageClient } from "./_components/OrdersPageClient";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata = { title: "Ordini evento — Vinifera" };

export default async function EventOrdersPage({ params }: Props) {
  const { id } = await params;
  return <OrdersPageClient eventId={id} />;
}
