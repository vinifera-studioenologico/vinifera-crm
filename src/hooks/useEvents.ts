"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getClientDb } from "@/lib/firebase/client";
import { getEvents } from "@/server/actions/events";
import type { EventDoc } from "@/schemas/event";

/**
 * Hook client-side per la lista eventi, con aggiornamento realtime via Firestore.
 * Cade in polling (server action) se il client SDK non è disponibile.
 */
export function useEvents(opts: { includeArchived?: boolean } = {}): {
  events: EventDoc[];
  loading: boolean;
} {
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let unsubSnap: (() => void) | null = null;

    async function poll() {
      try {
        const data = await getEvents(opts);
        if (!cancelled) {
          setEvents(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    const q = opts.includeArchived
      ? query(
          collection(getClientDb(), "events"),
          orderBy("startsAt", "asc"),
        )
      : query(
          collection(getClientDb(), "events"),
          where("deletedAt", "==", null),
          orderBy("startsAt", "asc"),
        );

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubSnap?.();
      unsubSnap = null;

      if (user) {
        unsubSnap = onSnapshot(
          q,
          () => {
            // On any change refresh via server action for type-safe EventDoc
            poll();
          },
          () => {
            // Fallback
            poll();
          },
        );
      } else {
        poll();
      }
    });

    return () => {
      cancelled = true;
      unsubSnap?.();
      unsubAuth();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.includeArchived]);

  return { events, loading };
}
