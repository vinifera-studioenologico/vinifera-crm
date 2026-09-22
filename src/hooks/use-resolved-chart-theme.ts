"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

/**
 * Tema risolto in modo sicuro per l'hydration: "light" finché il componente
 * non è montato (evita il mismatch SSR/client di next-themes), poi il tema
 * reale. Usato dai grafici per scegliere la palette light/dark.
 */
export function useResolvedChartTheme(): "light" | "dark" {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);
  return mounted && resolvedTheme === "dark" ? "dark" : "light";
}
