"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getClientDb } from "@/lib/firebase/client";
import { getLeads } from "@/server/actions/leads";

export function useNewLeadsCount(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubSnap: (() => void) | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;

    const q = query(
      collection(getClientDb(), "leads"),
      where("status", "==", "new"),
      where("deletedAt", "==", null),
    );

    async function poll() {
      try {
        const result = await getLeads({ status: "new" });
        if (!cancelled) setCount(result.items.length);
      } catch { /* ignore */ }
    }

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      // Clean up previous subscription
      unsubSnap?.(); unsubSnap = null;
      if (pollId) { clearInterval(pollId); pollId = null; }

      if (user) {
        // Authenticated → realtime via Firestore onSnapshot
        unsubSnap = onSnapshot(
          q,
          (snap) => { if (!cancelled) setCount(snap.size); },
          () => {
            // Permission denied fallback → poll
            poll();
            pollId = setInterval(poll, 30_000);
          },
        );
      } else {
        // Dev bypass (no Firebase session) → poll every 30 s
        poll();
        pollId = setInterval(poll, 30_000);
      }
    });

    return () => {
      cancelled = true;
      unsubAuth();
      unsubSnap?.();
      if (pollId) clearInterval(pollId);
    };
  }, []);

  return count;
}
