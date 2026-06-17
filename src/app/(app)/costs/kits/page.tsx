import { getKits } from "@/server/actions/costs";
import { getAnalyses } from "@/server/actions/analyses";
import { KitsTable } from "../_components/KitsTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kit — Vinifera" };

export default async function KitsPage() {
  const [kits, analyses] = await Promise.all([
    getKits(),
    getAnalyses({ includeArchived: false }),
  ]);
  return <KitsTable initialData={kits} analyses={analyses} />;
}
