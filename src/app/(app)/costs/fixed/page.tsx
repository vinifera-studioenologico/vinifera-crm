import { getFixedCosts } from "@/server/actions/costs";
import { FixedCostsTable } from "../_components/FixedCostsTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Costi fissi — Vinifera" };

export default async function FixedCostsPage() {
  const data = await getFixedCosts({ includeInactive: true });
  return <FixedCostsTable initialData={data} />;
}
