import type { ReactNode } from "react";

// Layout per le pagine pubbliche (landing, ecc.)
// Non include AppShell né autenticazione
export default function LandingLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
