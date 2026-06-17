import type { ReactNode } from "react";
import { CostsNav } from "./_components/CostsNav";

export default function CostsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-8">
      <CostsNav />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
