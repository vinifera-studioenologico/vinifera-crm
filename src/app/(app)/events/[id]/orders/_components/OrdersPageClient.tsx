"use client";

import { useEventOrders } from "@/hooks/useEventOrders";
import { OrdersTable } from "../../_components/OrdersTable";

interface Props {
  eventId: string;
}

export function OrdersPageClient({ eventId }: Props) {
  const { orders, loading } = useEventOrders(eventId);
  return (
    <div className="p-4 md:p-6">
      <OrdersTable orders={orders} loading={loading} />
    </div>
  );
}
