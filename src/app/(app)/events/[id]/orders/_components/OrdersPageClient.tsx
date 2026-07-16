"use client";

import type { EventOrderSummary } from "@/server/actions/eventOrders";
import { OrdersTable } from "../../_components/OrdersTable";
import { ManualOrderSheet } from "./ManualOrderSheet";

interface Props {
  eventId: string;
  eventPriceCents: number;
  initialOrders: EventOrderSummary[];
}

export function OrdersPageClient({ eventId, eventPriceCents, initialOrders }: Props) {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Ordini</h2>
        <ManualOrderSheet eventId={eventId} eventPriceCents={eventPriceCents} />
      </div>
      <OrdersTable orders={initialOrders} loading={false} />
    </div>
  );
}
