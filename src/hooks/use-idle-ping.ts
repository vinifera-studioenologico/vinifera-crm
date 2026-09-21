"use client";

import { useEffect, useRef } from "react";

// Non riarmare il timer ad ogni singolo evento: al massimo una volta ogni
// ~30s, altrimenti scroll/typing continui lo terrebbero sempre azzerato.
const REARM_THROTTLE_MS = 30_000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

interface UseIdlePingOptions {
  enabled: boolean;
  idleMs: number;
  onIdle: () => void;
}

/**
 * Chiama `onIdle` una sola volta se non arriva nessuna interazione utente
 * entro `idleMs` da quando l'effetto viene montato (o dall'ultimo riarmo).
 * Se il dispositivo va in sospensione il timeout scatta al risveglio, in
 * ritardo: è il comportamento voluto, la schermata era rimasta lì.
 */
export function useIdlePing({ enabled, idleMs, onIdle }: UseIdlePingOptions): void {
  const onIdleRef = useRef(onIdle);
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastRearm = 0;
    let fired = false;

    function arm() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!fired) {
          fired = true;
          onIdleRef.current();
        }
      }, idleMs);
    }

    function onActivity() {
      const now = Date.now();
      if (now - lastRearm < REARM_THROTTLE_MS) return;
      lastRearm = now;
      arm();
    }

    arm();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    return () => {
      if (timer) clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, [enabled, idleMs]);
}
