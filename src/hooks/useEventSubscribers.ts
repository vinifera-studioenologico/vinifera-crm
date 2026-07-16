"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getClientDb } from "@/lib/firebase/client";
import type { SubscriberDoc } from "@/schemas/eventSubscriber";

export function useEventSubscribers(): {
  subscribers: SubscriberDoc[];
  loading: boolean;
} {
  const [subscribers, setSubscribers] = useState<SubscriberDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let unsubSnap: (() => void) | null = null;

    const q = query(
      collection(getClientDb(), "eventSubscribers"),
      orderBy("createdAt", "desc"),
    );

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubSnap?.();
      unsubSnap = null;

      if (user) {
        unsubSnap = onSnapshot(
          q,
          (snap) => {
            if (cancelled) return;
            const docs = snap.docs.map((d) => ({
              id: d.id,
              email: d.data()["email"] ?? "",
              emailNormalized: d.data()["emailNormalized"] ?? "",
              status: d.data()["status"] ?? "pending",
              locale: d.data()["locale"] ?? "it",
              confirmToken: d.data()["confirmToken"] ?? "",
              unsubscribeToken: d.data()["unsubscribeToken"] ?? "",
              consentAt: d.data()["consentAt"],
              confirmedAt: d.data()["confirmedAt"] ?? null,
              unsubscribedAt: d.data()["unsubscribedAt"] ?? null,
              createdAt: d.data()["createdAt"],
              updatedAt: d.data()["updatedAt"],
            })) as SubscriberDoc[];
            setSubscribers(docs);
            setLoading(false);
          },
          () => setLoading(false),
        );
      } else {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubSnap?.();
      unsubAuth();
    };
  }, []);

  return { subscribers, loading };
}
