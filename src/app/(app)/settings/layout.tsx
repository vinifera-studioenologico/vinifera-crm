import type { ReactNode } from "react";
import { SettingsNav } from "./_components/SettingsNav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-8">
      {/* Sub-nav impostazioni */}
      <SettingsNav />
      {/* Contenuto */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
