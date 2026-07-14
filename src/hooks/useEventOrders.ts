"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getClientDb } from "@/lib/firebase/client";
import { getEventOrders, type EventOrderSummary } from "@/server/actions/eventOrders";

export function useEventOrders(eventId: string): {
  orders: EventOrderSummary[];
  loading: boolean;
} {
  const [orders, setOrders] = useState<EventOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let unsubSnap: (() => void) | null = null;

    async function poll() {
      try {
        const data = await getEventOrders(eventId);
        if (!cancelled) { setOrders(data); setLoading(false); }
      } catch { if (!cancelled) setLoading(false); }
    }

    const q = query(
      collection(getClientDb(), "eventOrders"),
      where("eventId", "==", eventId),
      orderBy("createdAt", "desc"),
    );

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubSnap?.(); unsubSnap = null;
      if (user) {
        unsubSnap = onSnapshot(q, () => poll(), () => poll());
      } else { poll(); }
    });

    return () => { cancelled = true; unsubSnap?.(); unsubAuth(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  return { orders, loading };
}
